import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/proposal_model.dart';
import '../../trips/domain/trip_model.dart';
import '../../../core/session/session.dart';
import 'incoming_requests_screen.dart' show TripRequestCard, DriverHistoryDialog;
import 'widgets/new_request_banner.dart';
import 'widgets/trip_request_card_compact.dart' show haversineKm;

/// Pantalla de detalle de UNA solicitud entrante.
///
/// Layout:
///  - Mapa FULLSCREEN de fondo con la ruta del viaje + origen + destino +
///    posición del conductor.
///  - Bottom sheet con la `TripRequestCard` (sin mini-mapa, porque ya hay
///    mapa de fondo). Tiene toda la lógica de negociación.
///  - Banner flotante arriba cuando llega NUEVA solicitud mientras estás
///    revisando esta — al tocarlo volvés a la lista.
///
/// Polling propio:
///  - Cada 5s si hay negociación activa, cada 10s si no.
///  - Trae todos los pending para detectar "nuevas" + counter del trip actual.
class IncomingRequestDetailScreen extends StatefulWidget {
  final String tripId;
  const IncomingRequestDetailScreen({super.key, required this.tripId});

  @override
  State<IncomingRequestDetailScreen> createState() =>
      _IncomingRequestDetailScreenState();
}

class _IncomingRequestDetailScreenState
    extends State<IncomingRequestDetailScreen> with WidgetsBindingObserver {
  Trip? _trip;
  DriverCounterInfo? _counter;
  List<LatLng> _routePoints = const [];
  bool _loading = true;
  String? _error;

  // Polling
  Timer? _pollingTimer;
  bool _isForeground = true;

  // Acciones / negociación
  bool _isActing = false;
  bool _isProposing = false;
  late final TextEditingController _proposeCtrl;
  final Set<String> _hiddenRejects = {};

  // Tracking de nuevas solicitudes que llegan mientras estoy acá.
  // Guardamos los IDs vistos al entrar; si después aparece otro trip que
  // no es este y no estaba antes, lo contamos como "nueva".
  Set<String> _seenTripIds = {};
  int _newCount = 0;
  Trip? _lastNewTrip;
  double? _lastNewDistanceKm;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _proposeCtrl = TextEditingController();
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollingTimer?.cancel();
    _proposeCtrl.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final wasFg = _isForeground;
    _isForeground = state == AppLifecycleState.resumed;
    if (_isForeground && !wasFg) {
      _load();
    } else if (!_isForeground) {
      _pollingTimer?.cancel();
      _pollingTimer = null;
    }
  }

  Future<void> _load() async {
    if (!_isForeground) return;
    final repo = context.read<TripsRepository>();
    try {
      // 1) Pending list: para encontrar este trip y detectar nuevos.
      final list = await repo.getPending();

      // Buscamos nuestro trip. Si no está en pending ya no se puede tomar.
      Trip? me;
      for (final t in list) {
        if (t.id == widget.tripId) { me = t; break; }
      }

      // Primera carga: snapshot inicial de IDs.
      if (_seenTripIds.isEmpty) {
        _seenTripIds = list.map((t) => t.id).toSet();
      } else {
        // Detectar nuevas (que NO estaban antes y NO son este trip).
        final newOnes = list
            .where((t) => !_seenTripIds.contains(t.id) && t.id != widget.tripId)
            .toList();
        if (newOnes.isNotEmpty) {
          _newCount += newOnes.length;
          _lastNewTrip = newOnes.last;
          // Distancia conductor → origen de la última nueva (si hay GPS).
          final lastPos =
              context.read<LocationTrackingService>().lastKnownPosition;
          if (lastPos != null) {
            _lastNewDistanceKm = haversineKm(
              LatLng(lastPos.latitude, lastPos.longitude),
              LatLng(_lastNewTrip!.originLat, _lastNewTrip!.originLng),
            );
          }
        }
        _seenTripIds = list.map((t) => t.id).toSet();
      }

      // 2) Counter del trip actual.
      DriverCounterInfo? counter;
      try {
        final counters = await repo.getMyCounterProposals([widget.tripId]);
        counter = counters[widget.tripId];
      } catch (_) {}

      // 3) Ruta del trip (solo la primera vez).
      if (_routePoints.isEmpty && me != null) {
        try {
          final info = await repo.getRoute(
            originLat: me.originLat,
            originLng: me.originLng,
            destLat: me.destLat,
            destLng: me.destLng,
          );
          // RouteInfo trae una lista de opciones de ruta. Tomamos la
          // primera (la principal) y de ahí sus coordenadas. Si no hay
          // opciones, queda vacío y el mapa solo muestra los markers.
          if (info.options.isNotEmpty) {
            _routePoints = info.options.first.coordinates;
          }
        } catch (_) {}
      }

      if (mounted) {
        setState(() {
          _trip = me ?? _trip;
          _counter = counter;
          _loading = false;
          _error = me == null ? 'Esta solicitud ya no está disponible.' : null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    } finally {
      // Reprograma siguiente poll: 5s si hay negociación viva, 10s normal.
      final hasActive = _counter?.isMyPending == true ||
          _counter?.isCounterFromPassenger == true;
      _pollingTimer?.cancel();
      if (_isForeground && mounted) {
        _pollingTimer = Timer(
          Duration(seconds: hasActive ? 5 : 10),
          _load,
        );
      }
    }
  }

  // ── ACCIONES (mismo orden y nombres que IncomingRequestsScreen) ──

  Future<void> _accept() async {
    final t = _trip;
    if (t == null) return;
    setState(() => _isActing = true);
    try {
      // Nuevo flujo: aceptar NO asigna directo. Espera confirmación del
      // pasajero. Vuelvo a la lista; cuando el pasajero confirme, el polling
      // de la lista me lleva a "viaje en curso".
      await context.read<TripsRepository>().driverAccept(t.id);
      if (!mounted) return;
      _showSnack('Aceptación enviada. Espera que el pasajero confirme.');
      if (context.canPop()) {
        context.pop();
      }
    } on ApiException catch (e) {
      _showSnack(e.message);
      if (mounted) setState(() => _isActing = false);
    } catch (_) {
      _showSnack('No se pudo aceptar el viaje.');
      if (mounted) setState(() => _isActing = false);
    }
  }

  Future<void> _decline() async {
    final t = _trip;
    if (t == null) return;
    setState(() => _isActing = true);
    try {
      await context.read<TripsRepository>().declineByDriver(t.id);
      if (!mounted) return;
      context.pop();
    } on ApiException catch (e) {
      _showSnack(e.message);
      if (mounted) setState(() => _isActing = false);
    } catch (_) {
      _showSnack('No se pudo declinar el viaje.');
      if (mounted) setState(() => _isActing = false);
    }
  }

  Future<void> _confirmAcceptance() async {
    final t = _trip;
    final c = _counter;
    if (t == null || c == null) return;
    setState(() => _isActing = true);
    try {
      await context.read<TripsRepository>().confirmAcceptance(t.id, c.id);
      if (!mounted) return;
      context.go('/driver/trip-in-progress');
    } on ApiException catch (e) {
      _showSnack(e.message);
      if (mounted) setState(() => _isActing = false);
    } catch (_) {
      _showSnack('No se pudo confirmar la aceptación.');
      if (mounted) setState(() => _isActing = false);
    }
  }

  Future<void> _submitProposal() async {
    final t = _trip;
    if (t == null) return;
    final raw = _proposeCtrl.text.trim();
    final fare = double.tryParse(raw.replaceAll(',', '.'));
    if (fare == null || fare <= 0) {
      _showSnack('Ingresa una tarifa válida.');
      return;
    }
    setState(() => _isActing = true);
    try {
      await context.read<TripsRepository>().proposeFare(t.id, fare);
      if (mounted) {
        setState(() {
          _isProposing = false;
          _isActing = false;
        });
      }
      await _load();
    } on ApiException catch (e) {
      _showSnack(e.message);
      if (mounted) setState(() => _isActing = false);
    } catch (_) {
      _showSnack('No se pudo enviar la propuesta.');
      if (mounted) setState(() => _isActing = false);
    }
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final t = _trip;
    if (t == null) {
      // Si la solicitud ya no está (la tomó otro, expiró, etc).
      return Scaffold(
        appBar: AppBar(title: const Text('Solicitud no disponible')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.info_outline,
                    size: 48, color: BugieColors.textMuted),
                const SizedBox(height: 12),
                Text(
                  _error ?? 'Esta solicitud ya no está disponible.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.pop(),
                  child: const Text('Volver a la lista'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Posición del conductor (puede ser null si todavía no llegó GPS).
    final lastPos = context.watch<LocationTrackingService>().lastKnownPosition;
    final driverPos = lastPos == null
        ? null
        : LatLng(lastPos.latitude, lastPos.longitude);

    // Markers para el mapa de fondo.
    final markers = <BugieMarker>[
      BugieMarker(
        position: LatLng(t.originLat, t.originLng),
        kind: MarkerKind.origin,
      ),
      BugieMarker(
        position: LatLng(t.destLat, t.destLng),
        kind: MarkerKind.destination,
      ),
      if (driverPos != null)
        BugieMarker(position: driverPos, kind: MarkerKind.driver),
    ];

    return Scaffold(
      body: Stack(
        children: [
          // ── MAPA FULLSCREEN ─────────────────────────────────────────
          Positioned.fill(
            child: BugieMap(
              height: MediaQuery.of(context).size.height,
              markers: markers,
              route: _routePoints,
              center: LatLng(t.originLat, t.originLng),
              fitBoundsOnMarkers: true,
              // Sus botones de zoom/foco quedan tapados por el sheet,
              // así que los empujamos hacia arriba.
              controlsBottomOffset:
                  MediaQuery.of(context).size.height * 0.50,
            ),
          ),

          // ── BOTÓN VOLVER + BANNER NUEVA SOLICITUD ───────────────────
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _CircleIconBtn(
                    icon: Icons.arrow_back,
                    onTap: () => context.pop(),
                  ),
                  if (_newCount > 0) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: NewRequestBanner(
                        count: _newCount,
                        lastFare: _lastNewTrip?.estimatedFare,
                        lastDistanceKm: _lastNewDistanceKm,
                        onTap: () => context.pop(),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // ── BOTTOM SHEET con la TripRequestCard ─────────────────────
          // Reusamos la card vieja con showMap: false para no duplicar
          // mapa. Mantiene toda la lógica de banners, propose, accept.
          DraggableScrollableSheet(
            initialChildSize: 0.48,
            minChildSize: 0.22,
            maxChildSize: 0.92,
            snap: true,
            snapSizes: const [0.22, 0.48, 0.92],
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(20),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.15),
                      blurRadius: 20,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    // Handle visual
                    Container(
                      margin: const EdgeInsets.symmetric(vertical: 8),
                      width: 40, height: 4,
                      decoration: BoxDecoration(
                        color: BugieColors.textMuted.withOpacity(0.3),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        controller: scrollController,
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                        children: [
                          TripRequestCard(
                            trip: t,
                            counter: _counter,
                            hideRejected: _counter != null &&
                                _hiddenRejects.contains(_counter!.id),
                            isActing: _isActing,
                            isProposing: _isProposing,
                            proposeController: _proposeCtrl,
                            driverPosition: driverPos,
                            routePoints: _routePoints,
                            showMap: false, // el mapa ya está de fondo
                            onAccept: _accept,
                            onDecline: _decline,
                            onTogglePropose: () => setState(() {
                              _isProposing = !_isProposing;
                              if (_isProposing && _proposeCtrl.text.isEmpty) {
                                _proposeCtrl.text =
                                    t.estimatedFare.toStringAsFixed(2);
                              }
                            }),
                            onSubmitPropose: _submitProposal,
                            onCancelPropose: () =>
                                setState(() => _isProposing = false),
                            onHideRejected: () {
                              final c = _counter;
                              if (c != null) {
                                setState(() => _hiddenRejects.add(c.id));
                              }
                            },
                            onOpenHistory: () {
                              // Abre el mismo modal de historial que la lista.
                              final myUserId =
                                  context.read<Session>().user?.userId;
                              if (myUserId == null) return;
                              showDialog(
                                context: context,
                                builder: (_) => DriverHistoryDialog(
                                  tripId: widget.tripId,
                                  myUserId: myUserId,
                                ),
                              );
                            },
                            onConfirmAcceptance: _confirmAcceptance,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

/// Botón circular flotante (volver) sobre el mapa.
class _CircleIconBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _CircleIconBtn({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color: const Color(0xCC0D1117),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withOpacity(0.1)),
          ),
          child: const Icon(Icons.arrow_back, size: 18, color: Colors.white),
        ),
      ),
    );
  }
}