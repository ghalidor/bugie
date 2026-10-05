import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/services/active_trip_service.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../../core/widgets/negotiation/negotiation.dart';
import '../../../core/widgets/schedule_picker.dart';
import '../../../core/widgets/service_badge.dart';
import '../../../core/widgets/trip_photos_gallery.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/proposal_model.dart';
import '../../trips/domain/trip_photo_model.dart';
import '../../trips/domain/trip_model.dart';
import '../../../core/session/session.dart';
import 'incoming_requests_screen.dart'
    show
        ActiveTripNotice,
        DriverHistoryDialog,
        PassengerAvatar,
        shortPassengerName;
import 'widgets/new_request_banner.dart';
import 'widgets/trip_request_card_compact.dart' show haversineKm;

/// Pantalla de detalle de UNA solicitud entrante.
///
/// Layout:
///  - Mapa FULLSCREEN de fondo con la ruta del viaje + origen + destino +
///    posición del conductor.
///  - Hoja inferior con: precio grande, chips (distancia, "a X min", pago,
///    envío), origen/paradas/destino, estado de la negociación animado,
///    contraoferta rápida (chips +1/+2/+3 y "Otro monto") y UN botón
///    principal "Aceptar S/ X" con "Rechazar" como acción secundaria.
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
  /// Distancia y duración del viaje (origen → destino), de la misma ruta.
  double? _routeKm;
  double? _routeMin;
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
  /// Monto que se está enviando ahora mismo (para el estado "Enviando…").
  double? _sendingFare;
  /// Qué botón está trabajando: 'accept' | 'decline' | 'confirm' | 'propose'.
  String? _actingKind;

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
    ActiveTripService().active.addListener(_onActiveTrip);
    _load();
  }

  void _onActiveTrip() {
    if (mounted) setState(() {});
  }

  /// Con un viaje activo no se puede aceptar, proponer ni confirmar otra
  /// solicitud: avisa y devuelve true.
  bool _blockedByActiveTrip() {
    final active = ActiveTripService().active.value;
    if (active == null) return false;
    _showSnack(ActiveTripNotice.message(active.isDelivery));
    return true;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ActiveTripService().active.removeListener(_onActiveTrip);
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
            _routeKm = info.options.first.distanceKm;
            _routeMin = info.options.first.durationMinutes;
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
    if (t == null || _blockedByActiveTrip()) return;
    setState(() {
      _isActing = true;
      _actingKind = 'accept';
    });
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
    setState(() {
      _isActing = true;
      _actingKind = 'decline';
    });
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
    if (t == null || c == null || _blockedByActiveTrip()) return;
    setState(() {
      _isActing = true;
      _actingKind = 'confirm';
    });
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
    if (_blockedByActiveTrip()) return;
    final raw = _proposeCtrl.text.trim();
    final fare = double.tryParse(raw.replaceAll(',', '.'));
    if (fare == null || fare <= 0) {
      _showSnack('Ingresa una tarifa válida.');
      return;
    }
    await _sendProposal(fare);
  }

  /// Chip de contraoferta rápida: confirmación breve y envía con la misma
  /// llamada que "Otro monto".
  Future<void> _quickPropose(double fare) async {
    if (_blockedByActiveTrip()) return;
    final ok = await confirmQuickFare(context,
        fare: fare, recipient: 'el pasajero');
    if (!ok || !mounted) return;
    await _sendProposal(fare);
  }

  /// Envía una propuesta de tarifa al pasajero (llamada existente proposeFare).
  Future<void> _sendProposal(double fare) async {
    final t = _trip;
    if (t == null || _blockedByActiveTrip()) return;
    setState(() {
      _isActing = true;
      _actingKind = 'propose';
      _sendingFare = fare;
    });
    try {
      await context.read<TripsRepository>().proposeFare(t.id, fare);
      if (mounted) {
        setState(() {
          _isProposing = false;
          _isActing = false;
          _sendingFare = null;
        });
      }
      await _load();
    } on ApiException catch (e) {
      _showSnack(e.message);
      if (mounted) {
        setState(() {
          _isActing = false;
          _sendingFare = null;
        });
      }
    } catch (_) {
      _showSnack('No se pudo enviar la propuesta.');
      if (mounted) {
        setState(() {
          _isActing = false;
          _sendingFare = null;
        });
      }
    }
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  static String _payLabel(String m) {
    switch (m) {
      case 'cash': return 'Efectivo';
      case 'yape': return 'Yape';
      case 'plin': return 'Plin';
      default:     return m.toUpperCase();
    }
  }

  static IconData _payIcon(String m) =>
      m == 'cash' ? Icons.payments_outlined : Icons.qr_code_2_rounded;

  static String _timeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'ahora';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    return 'hace ${diff.inHours} h';
  }

  /// "a X min" hasta el pasajero: distancia en línea recta a ~22 km/h
  /// (la misma estimación que usa la pantalla de viaje en curso).
  static String _etaText(double km) {
    final min = (km / 22.0 * 60.0).round();
    return min < 1 ? 'a menos de 1 min' : 'a $min min';
  }

  void _openHistory() {
    // Abre el mismo modal de historial que la lista.
    final myUserId = context.read<Session>().user?.userId;
    if (myUserId == null) return;
    showDialog(
      context: context,
      builder: (_) => DriverHistoryDialog(
        tripId: widget.tripId,
        myUserId: myUserId,
      ),
    );
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
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  NegotiationStatusBanner(
                    state: NegotiationState.expired,
                    title: _error ?? 'Esta solicitud ya no está disponible.',
                    message:
                        'Puede que otro conductor la haya tomado o que el pasajero la cancelara.',
                  ),
                  const SizedBox(height: 16),
                  PrimaryActionButton(
                    label: 'Volver a la lista',
                    icon: Icons.arrow_back,
                    color: BugieColors.primary,
                    onPressed: () => context.pop(),
                  ),
                ],
              ),
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

    final sortedWp = [...t.waypoints]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    // Markers para el mapa de fondo.
    final markers = <BugieMarker>[
      BugieMarker(
        position: LatLng(t.originLat, t.originLng),
        kind: MarkerKind.origin,
      ),
      ...sortedWp.asMap().entries.map((e) => BugieMarker(
            position: LatLng(e.value.lat, e.value.lng),
            kind: MarkerKind.waypoint,
            waypointIndex: e.key,
          )),
      BugieMarker(
        position: LatLng(t.destLat, t.destLng),
        kind: MarkerKind.destination,
      ),
      if (driverPos != null)
        BugieMarker(position: driverPos, kind: MarkerKind.driver),
    ];

    final screenH = MediaQuery.of(context).size.height;

    return Scaffold(
      // Barra fija abajo con la acción principal: siempre visible, sin
      // tener que deslizar la hoja (y sin quedar bajo la barra del sistema).
      bottomNavigationBar: _bottomBar(t),
      body: Stack(
        children: [
          // ── MAPA FULLSCREEN ─────────────────────────────────────────
          Positioned.fill(
            child: BugieMap(
              height: screenH,
              markers: markers,
              route: _routePoints,
              center: LatLng(t.originLat, t.originLng),
              fitBoundsOnMarkers: true,
              fitOnReady: true,
              // La hoja inferior tapa la mitad de abajo: encuadramos la
              // ruta en la zona visible de arriba.
              fitPadding: EdgeInsets.fromLTRB(48, 96, 72, screenH * 0.52),
              // Sus botones de zoom/foco quedan tapados por el sheet,
              // así que los empujamos hacia arriba.
              controlsBottomOffset: screenH * 0.50,
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

          // ── HOJA INFERIOR con precio, datos y acciones ──────────────
          DraggableScrollableSheet(
            initialChildSize: 0.5,
            minChildSize: 0.22,
            maxChildSize: 0.94,
            snap: true,
            snapSizes: const [0.22, 0.5, 0.94],
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(24),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.15),
                      blurRadius: 20,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: ListView(
                  controller: scrollController,
                  padding: EdgeInsets.fromLTRB(
                      20, 0, 20, 24 + MediaQuery.of(context).viewInsets.bottom),
                  children: [
                    // Handle visual
                    Center(
                      child: Container(
                        margin: const EdgeInsets.only(top: 10, bottom: 14),
                        width: 44,
                        height: 5,
                        decoration: BoxDecoration(
                          color: BugieColors.textMuted.withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    ..._sheetChildren(t, sortedWp, driverPos),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  /// Contenido de la hoja inferior.
  List<Widget> _sheetChildren(
      Trip t, List<Waypoint> sortedWp, LatLng? driverPos) {
    final c = _counter;
    final bc = context.bugie;
    final passengerCounter = c?.isCounterFromPassenger == true;
    final waitingMyConfirm = c?.isWaitingMyConfirmation == true;
    // Lo que ofrece el pasajero (o su contrapropuesta, si respondió).
    // estimatedFare = oferta del pasajero (proposedFare es la primera
    // propuesta de algún conductor).
    final offer = t.estimatedFare;
    final headline = passengerCounter ? c!.fare : offer;
    // Chips rápidos: precio ofrecido +1, +2, +3.
    final fares = quickFares(base: headline, deltas: const [1, 2, 3]);
    final pickupKm = driverPos == null
        ? null
        : haversineKm(driverPos, LatLng(t.originLat, t.originLng));
    final busy = _isActing;
    final activeTrip = ActiveTripService().active.value;

    return [
      // Con un viaje activo no puede aceptar ni proponer (solo ver).
      if (activeTrip != null) ...[
        ActiveTripNotice(isDelivery: activeTrip.isDelivery),
        const SizedBox(height: 12),
      ],
      // ── Cabecera: tipo de servicio + tiempo + historial ──
      Row(
        children: [
          ServiceBadge(isDelivery: t.isDelivery, compact: true),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _timeAgo(t.createdAt),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: bc.textMuted),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            tooltip: 'Mi historial de propuestas',
            icon: Icon(Icons.history, color: bc.textMuted),
            onPressed: _isActing ? null : _openHistory,
          ),
        ],
      ),
      if (t.scheduledAt != null) ...[
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerLeft,
          child: ScheduledBadge(at: t.scheduledAt!),
        ),
      ],
      // Vencimiento: confirmar la propuesta aceptada / hora del programado.
      if (t.expiresAt != null) ...[
        const SizedBox(height: 6),
        Align(
          alignment: Alignment.centerLeft,
          child: ExpiryCountdown(
              expiresAt: t.expiresAt!, reason: t.expiresReason),
        ),
      ],
      const SizedBox(height: 8),

      // ── Pasajero + PRECIO grande ──
      Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          PassengerAvatar(
              photoUrl: t.passengerPhotoUrl, name: t.passengerName, size: 48),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        shortPassengerName(t.passengerName,
                            shortName: t.passengerShortName),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13, color: bc.textMuted),
                      ),
                    ),
                    // Calificación del pasajero (hoy siempre null: no se pinta).
                    if (t.passengerRating != null) ...[
                      const SizedBox(width: 6),
                      PassengerRatingChip(
                          rating: t.passengerRating,
                          count: t.passengerRatingCount),
                    ],
                  ],
                ),
                PriceTag(
                  amount: headline,
                  label: passengerCounter ? 'Te propone' : 'Ofrece',
                  fontSize: 34,
                  highlight: passengerCounter,
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),

      // ── Chips de datos ──
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          if (_routeKm != null)
            InfoChip(
              icon: Icons.route_outlined,
              text: _routeMin != null
                  ? '${_routeKm!.toStringAsFixed(1)} km · ${_routeMin!.round()} min'
                  : '${_routeKm!.toStringAsFixed(1)} km',
            ),
          if (pickupKm != null)
            InfoChip(
              icon: Icons.near_me_outlined,
              text: _etaText(pickupKm),
              color: BugieColors.primary,
            ),
          InfoChip(
              icon: _payIcon(t.paymentMethod), text: _payLabel(t.paymentMethod)),
          if (sortedWp.isNotEmpty)
            InfoChip(
              icon: Icons.more_vert,
              text: sortedWp.length == 1
                  ? '1 parada'
                  : '${sortedWp.length} paradas',
              color: BugieColors.mapWaypoint,
            ),
          if (t.isDelivery)
            const InfoChip(
              icon: Icons.inventory_2_outlined,
              text: 'Envío',
              color: BugieColors.accent,
            ),
          if (t.isDelivery && t.packageIsFragile)
            const InfoChip(
              icon: Icons.warning_amber_rounded,
              text: 'Frágil',
              color: BugieColors.danger,
            ),
        ],
      ),
      const SizedBox(height: 14),

      // ── Envío: paquete + fotos en miniatura ──
      if (t.isDelivery) ...[
        _PackageSummary(trip: t),
        const SizedBox(height: 8),
        TripPhotosGallery(
          tripId: t.id,
          title: 'Fotos del paquete',
          kinds: const {TripPhotoKind.package},
          emptyText: 'El cliente no adjuntó fotos del paquete.',
        ),
        const SizedBox(height: 14),
      ],

      // ── Origen / paradas / destino ──
      _RouteStops(trip: t, waypoints: sortedWp),
      const SizedBox(height: 16),

      // ── Estado de la negociación (animado) ──
      AnimatedSize(
        duration: motionDuration(context, 250),
        curve: Curves.easeOut,
        alignment: Alignment.topCenter,
        child: _statusBanner(c),
      ),

      // ── Contraoferta (la acción principal va en la barra fija de abajo) ──
      AnimatedSwitcher(
        duration: motionDuration(context, 280),
        transitionBuilder: (child, anim) => FadeTransition(
          opacity: anim,
          child: SizeTransition(
              sizeFactor: anim, axisAlignment: -1, child: child),
        ),
        child: waitingMyConfirm
            ? const SizedBox(key: ValueKey('none'), width: double.infinity)
            : Column(
                key: const ValueKey('actions'),
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '¿Quieres cobrar otro monto?',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: bc.text),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Toca un monto para enviárselo al pasajero.',
                    style: TextStyle(fontSize: 12.5, color: bc.textMuted),
                  ),
                  const SizedBox(height: 10),
                  FareChips(
                    fares: fares,
                    referenceFare: headline,
                    enabled: !busy && activeTrip == null,
                    onSelected: _quickPropose,
                    onOther: () {
                      if (_blockedByActiveTrip()) return;
                      setState(() {
                      _isProposing = !_isProposing;
                      if (_isProposing && _proposeCtrl.text.isEmpty) {
                        _proposeCtrl.text = t.estimatedFare.toStringAsFixed(2);
                      }
                      });
                    },
                  ),
                  AnimatedSize(
                    duration: motionDuration(context, 220),
                    alignment: Alignment.topCenter,
                    child: _isProposing
                        ? Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: _EnsureVisible(
                              child: FareInputPanel(
                                controller: _proposeCtrl,
                                title: 'Proponer otro monto al pasajero',
                                hint: t.estimatedFare.toStringAsFixed(2),
                                loading:
                                    _isActing && _actingKind == 'propose',
                                onSubmit: _submitProposal,
                                onCancel: () =>
                                    setState(() => _isProposing = false),
                              ),
                            ),
                          )
                        : const SizedBox(width: double.infinity),
                  ),
                ],
              ),
      ),
    ];
  }

  /// Barra fija inferior: UNA acción principal grande ("Aceptar S/ X" o
  /// "Confirmar y empezar") y "Rechazar" como secundaria a su lado.
  /// Mientras se escribe "Otro monto" se oculta: ahí la acción principal es
  /// "Enviar oferta" del propio panel.
  Widget? _bottomBar(Trip t) {
    final c = _counter;
    final bc = context.bugie;
    final passengerCounter = c?.isCounterFromPassenger == true;
    final waitingMyConfirm = c?.isWaitingMyConfirmation == true;
    // "Aceptar" acepta a estimatedFare (oferta del pasajero).
    final offer = t.estimatedFare;
    final busy = _isActing;
    // Viaje activo: aceptar / confirmar quedan deshabilitados.
    final blocked = ActiveTripService().hasActive;
    if (_isProposing && !waitingMyConfirm) return null;

    final Widget content = waitingMyConfirm
        ? PrimaryActionButton(
            key: const ValueKey('confirm'),
            label: t.isDelivery
                ? 'Confirmar y empezar envío'
                : 'Confirmar y empezar viaje',
            icon: Icons.play_arrow_rounded,
            loading: _isActing && _actingKind == 'confirm',
            onPressed: _isActing || blocked ? null : _confirmAcceptance,
          )
        : Row(
            key: const ValueKey('actions'),
            children: [
              Expanded(
                flex: 1,
                child: _RejectButton(
                  loading: _isActing && _actingKind == 'decline',
                  onPressed: busy ? null : _decline,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: PrimaryActionButton(
                  // Aceptar = misma acción de siempre (driverAccept),
                  // también cuando el pasajero contrapropuso. Por eso
                  // en ese caso no se muestra el monto de la contra.
                  label: passengerCounter
                      ? 'Aceptar'
                      : 'Aceptar ${formatSoles(offer)}',
                  icon: Icons.check_rounded,
                  loading: _isActing && _actingKind == 'accept',
                  onPressed: busy || blocked ? null : _accept,
                ),
              ),
            ],
          );

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: bc.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: AnimatedSwitcher(
            duration: motionDuration(context, 250),
            child: content,
          ),
        ),
      ),
    );
  }

  /// Aviso del estado de la negociación según el counter actual.
  Widget _statusBanner(DriverCounterInfo? c) {
    Widget wrap(Widget w) =>
        Padding(padding: const EdgeInsets.only(bottom: 14), child: w);

    if (_sendingFare != null) {
      return wrap(NegotiationStatusBanner(
        state: NegotiationState.sending,
        title: 'Enviando tu oferta de ${formatSoles(_sendingFare!)}…',
      ));
    }
    if (c == null) return const SizedBox(width: double.infinity);
    if (c.isWaitingMyConfirmation) {
      return wrap(NegotiationStatusBanner(
        state: NegotiationState.accepted,
        title: '¡El pasajero aceptó ${formatSoles(c.fare)}!',
        message: 'Confirma para empezar. Al confirmar, tus demás solicitudes '
            'pendientes se rechazarán automáticamente.',
      ));
    }
    if (c.isMyPending) {
      return wrap(NegotiationStatusBanner(
        state: NegotiationState.waiting,
        title: 'Propuesta enviada: ${formatSoles(c.fare)}',
        message: 'Esperando al pasajero. Si quieres, envía otro monto.',
      ));
    }
    if (c.isCounterFromPassenger) {
      return wrap(NegotiationStatusBanner(
        state: NegotiationState.counter,
        title: 'El pasajero te propone ${formatSoles(c.fare)}',
        message: 'Si te conviene, envíale el mismo monto con "Otro monto". '
            'Si no, propón otro monto o rechaza.',
      ));
    }
    if (c.isRejected && !_hiddenRejects.contains(c.id)) {
      return wrap(NegotiationStatusBanner(
        state: NegotiationState.rejected,
        title: 'El pasajero rechazó tu oferta de ${formatSoles(c.fare)}',
        message: 'Puedes enviar otra o esperar.',
        trailing: IconButton(
          visualDensity: VisualDensity.compact,
          tooltip: 'Ocultar aviso',
          icon: const Icon(Icons.close, size: 18),
          onPressed: () => setState(() => _hiddenRejects.add(c.id)),
        ),
      ));
    }
    return const SizedBox(width: double.infinity);
  }
}

/// Origen, paradas y destino con íconos y una línea que los une.
class _RouteStops extends StatelessWidget {
  final Trip trip;
  final List<Waypoint> waypoints;
  const _RouteStops({required this.trip, required this.waypoints});

  @override
  Widget build(BuildContext context) {
    final rows = <(IconData, Color, String, String)>[
      (Icons.trip_origin, BugieColors.mapOrigin, 'Recojo', trip.originAddress),
      for (var i = 0; i < waypoints.length; i++)
        (Icons.radio_button_checked, BugieColors.mapWaypoint, 'Parada ${i + 1}',
            waypoints[i].address),
      (Icons.location_on, BugieColors.mapDestination, 'Destino',
          trip.destAddress),
    ];
    final c = context.bugie;
    return Column(
      children: [
        for (var i = 0; i < rows.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 24,
                  child: Column(
                    children: [
                      Icon(rows[i].$1, size: 20, color: rows[i].$2),
                      if (i < rows.length - 1)
                        Expanded(
                          child: Container(
                            width: 2,
                            margin: const EdgeInsets.symmetric(vertical: 2),
                            color: c.border,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(
                        bottom: i < rows.length - 1 ? 12 : 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(rows[i].$3,
                            style:
                                TextStyle(fontSize: 11.5, color: c.textMuted)),
                        Text(rows[i].$4,
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: c.text)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Datos del paquete (solo envíos): descripción, peso y detalles.
class _PackageSummary extends StatelessWidget {
  final Trip trip;
  const _PackageSummary({required this.trip});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final desc = (trip.packageDescription ?? '').trim();
    final details = (trip.packageDetails ?? '').trim();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BugieColors.accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BugieColors.accent.withValues(alpha: 0.30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.inventory_2_outlined,
                  size: 18, color: BugieColors.accent),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  desc.isEmpty ? 'Paquete' : desc,
                  style: TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 14, color: c.text),
                ),
              ),
              if (trip.packageWeightKg != null)
                Text('${trip.packageWeightKg} kg',
                    style: TextStyle(fontSize: 12.5, color: c.textMuted)),
            ],
          ),
          if (details.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(details, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
          ],
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
          width: 44, height: 44,
          decoration: BoxDecoration(
            color: const Color(0xCC0D1117),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
          ),
          child: Icon(icon, size: 20, color: Colors.white),
        ),
      ),
    );
  }
}

/// "Rechazar" con borde rojo, mismo alto que el botón principal.
class _RejectButton extends StatelessWidget {
  final bool loading;
  final VoidCallback? onPressed;
  const _RejectButton({required this.loading, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: BugieColors.danger,
        minimumSize: const Size(0, 54),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        side: BorderSide(
          color: BugieColors.danger
              .withValues(alpha: onPressed == null ? 0.3 : 0.7),
          width: 1.4,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      onPressed: onPressed,
      child: loading
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                  strokeWidth: 2.4, color: BugieColors.danger),
            )
          : const FittedBox(
              fit: BoxFit.scaleDown,
              child: Text('Rechazar',
                  maxLines: 1,
                  style:
                      TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ),
    );
  }
}

/// Al aparecer (p. ej. el panel "Otro monto" con el teclado) desliza la
/// hoja para que quede completo a la vista.
class _EnsureVisible extends StatefulWidget {
  final Widget child;
  const _EnsureVisible({required this.child});

  @override
  State<_EnsureVisible> createState() => _EnsureVisibleState();
}

class _EnsureVisibleState extends State<_EnsureVisible> {
  @override
  void initState() {
    super.initState();
    // Espera a que suba el teclado antes de desplazar (y repite por si el
    // teclado tardó más en terminar de subir).
    for (final ms in const [400, 900]) {
      Future.delayed(Duration(milliseconds: ms), _reveal);
    }
  }

  void _reveal() {
    if (!mounted) return;
    Scrollable.ensureVisible(
      context,
      alignment: 1,
      duration: motionDuration(context, 250),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
