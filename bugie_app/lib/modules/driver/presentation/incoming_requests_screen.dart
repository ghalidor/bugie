import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/proposal_model.dart';
import '../../trips/domain/trip_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import 'widgets/trip_request_card_compact.dart';

/// Solicitudes entrantes para el conductor.
/// Polling cada 10s a /api/trips/pending + /api/trips/my-counter-proposals.
///
/// Reglas de banners (alineadas con bugie-web/driver/IncomingRequest.tsx):
///   - Naranja: contrapropuesta del pasajero esperando MI respuesta.
///   - Azul:    MI propuesta vigente esperando respuesta del pasajero.
///   - Rojo:    feedback "el pasajero rechazó mi propuesta" (X para ocultar, 24h).
///
/// El backend (my-counter-proposals) garantiza prioridad: nunca devuelve dos a la vez.
class IncomingRequestsScreen extends StatefulWidget {
  const IncomingRequestsScreen({super.key});

  @override
  State<IncomingRequestsScreen> createState() => _IncomingRequestsScreenState();
}

class _IncomingRequestsScreenState extends State<IncomingRequestsScreen>
    with WidgetsBindingObserver {
  List<Trip> _trips = [];
  bool _loading = true;
  String? _error;

  /// Timer del polling. Lo reagendamos en cada _load() con el intervalo
  /// que corresponda según si hay solicitudes / negociación activa.
  Timer? _pollingTimer;

  /// True si la app está en foreground. Cuando va a background pausamos
  /// el polling para no gastar batería/datos/backend.
  bool _isForeground = true;

  /// Fallos consecutivos por error de red. 2+ activa banner "sin conexión".
  int _failureCount = 0;

  /// Timestamp del último load exitoso.
  DateTime? _lastSuccessAt;

  /// Timer que refresca el texto "hace X" del banner sin red.
  Timer? _staleTickTimer;

  /// Estado de negociación con el pasajero por viaje.
  Map<String, DriverCounterInfo> _counters = {};

  /// id del viaje sobre el que se está actuando (loading button).
  String? _acting;

  /// id del viaje cuyo panel de "proponer tarifa" está abierto.
  String? _proposingId;

  /// Texto del input de propuesta por viaje.
  final Map<String, TextEditingController> _proposeCtrl = {};

  /// IDs de feedback "rejected" que el conductor ocultó (X). Solo en memoria.
  final Set<String> _hiddenRejects = {};

  /// Cache de rutas calculadas por tripId. Se llena la primera vez que vemos
  /// una solicitud y se reutiliza en cada poll. Si el viaje desaparece de la
  /// lista (rechazado/aceptado por otro), se purga. Evita pedir la ruta
  /// repetidamente a /api/trips/route en cada poll.
  final Map<String, List<LatLng>> _routeCache = {};

  /// True si hay problemas de red sostenidos (2+ fallos seguidos).
  bool get _isOffline => _failureCount >= 2;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _staleTickTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) {
        if (mounted && _isOffline) setState(() {});
      },
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollingTimer?.cancel();
    _staleTickTimer?.cancel();
    for (final c in _proposeCtrl.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final wasForeground = _isForeground;
    _isForeground = state == AppLifecycleState.resumed;

    if (_isForeground && !wasForeground) {
      _load();
    } else if (!_isForeground) {
      _pollingTimer?.cancel();
      _pollingTimer = null;
    }
  }

  /// Intervalo del próximo polling.
  /// Si hay fallos consecutivos, backoff exponencial 5s → 10s → 20s → 30s.
  /// Si no, según actividad: 30s sin solicitudes, 10s con solicitudes,
  /// 5s con negociación activa.
  Duration _pollingInterval() {
    if (_failureCount > 0) {
      final seconds =
          (5 * (1 << (_failureCount - 1))).clamp(5, 30);
      return Duration(seconds: seconds);
    }
    if (_trips.isEmpty) return const Duration(seconds: 30);
    final hasActiveNegotiation = _counters.values.any(
      (c) => c.isMyPending || c.isCounterFromPassenger,
    );
    if (hasActiveNegotiation) return const Duration(seconds: 5);
    return const Duration(seconds: 10);
  }

  /// Reagenda el siguiente _load() con el intervalo actual.
  void _scheduleNext() {
    _pollingTimer?.cancel();
    if (!_isForeground) return;
    _pollingTimer = Timer(_pollingInterval(), _load);
  }

  Future<void> _load() async {
    if (!_isForeground) return;

    final repo = context.read<TripsRepository>();

    // Si el pasajero ya confirmó una aceptación mía, tengo un viaje activo:
    // salto directo a "viaje en curso".
    try {
      final active = await repo.getActive();
      if (active != null &&
          active.driverId != null &&
          (active.status == TripStatus.accepted ||
              active.status == TripStatus.inProgress ||
              active.status == TripStatus.sosActive)) {
        if (mounted) context.go('/driver/trip-in-progress');
        return;
      }
    } catch (_) {}

    try {
      final list = await repo.getPending();

      Map<String, DriverCounterInfo> counters = {};
      if (list.isNotEmpty) {
        try {
          counters = await repo.getMyCounterProposals(
            list.map((t) => t.id).toList(),
          );
        } catch (_) {}
      }

      if (mounted) {
        setState(() {
          _trips = list;
          _counters = counters;
          _loading = false;
          _error = null;
          _failureCount = 0;
          _lastSuccessAt = DateTime.now();
        });
        // Purga del cache las rutas de viajes que ya no aparecen,
        // y calcula las rutas de viajes nuevos. Async, sin bloquear.
        _syncRouteCache(list);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          if (e.isNetwork) {
            _failureCount = (_failureCount + 1).clamp(0, 10);
            // Mantenemos _trips/_counters previos visibles.
          } else {
            _error = e.message;
          }
        });
      }
    } catch (e, st) {
      // DIAGNOSTICO TEMPORAL
      // ignore: avoid_print
      print('[INCOMING_DEBUG] _load error: $e');
      // ignore: avoid_print
      print('[INCOMING_DEBUG] stacktrace: $st');
      if (mounted) {
        setState(() {
          _loading = false;
          _failureCount = (_failureCount + 1).clamp(0, 10);
          _error = 'DEBUG: $e';
        });
      }
    } finally {
      if (mounted) _scheduleNext();
    }
  }

  /// Mantiene `_routeCache` sincronizado con la lista actual de trips:
  ///  - Purga rutas de tripIds que ya no aparecen en la lista (viaje aceptado
  ///    por otro, rechazado, expirado).
  ///  - Para tripIds nuevos pide la ruta a `/api/trips/route` UNA vez.
  /// Es resistente a errores: si una ruta falla, simplemente queda sin cachear
  /// y se intentará en el próximo poll.
  Future<void> _syncRouteCache(List<Trip> trips) async {
    final liveIds = trips.map((t) => t.id).toSet();

    // Purgar lo viejo
    _routeCache.removeWhere((id, _) => !liveIds.contains(id));

    // Calcular lo nuevo (solo los que no están cacheados)
    final missing = trips.where((t) => !_routeCache.containsKey(t.id));
    if (missing.isEmpty) return;

    final repo = context.read<TripsRepository>();
    for (final t in missing) {
      try {
        final info = await repo.getRoute(
          originLat: t.originLat,
          originLng: t.originLng,
          destLat: t.destLat,
          destLng: t.destLng,
        );
        if (!mounted) return;
        if (info.options.isNotEmpty) {
          _routeCache[t.id] = info.options.first.coordinates;
          setState(() {}); // repinta cards con la ruta nueva
        }
      } catch (_) {
        // Sin ruta cacheada todavía. El próximo poll volverá a intentar.
      }
    }
  }

  /// Declinar: ahora SÍ llama al backend. Marca rejected/driver todas las
  /// propuestas pending entre este conductor y el viaje. El pasajero verá
  /// el card "el conductor declinó".
  Future<void> _decline(Trip t) async {
    setState(() {
      _acting = t.id;
      _error = null;
    });
    try {
      await context.read<TripsRepository>().declineByDriver(t.id);
      if (!mounted) return;
      setState(() {
        _trips = _trips.where((x) => x.id != t.id).toList();
        _counters = {..._counters}..remove(t.id);
        _acting = null;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _acting = null;
        });
      }
    }
  }

  Future<void> _accept(Trip t) async {
    setState(() {
      _acting = t.id;
      _error = null;
    });
    try {
      // Nuevo flujo: aceptar NO asigna directo. Queda esperando que el
      // pasajero confirme. El polling (getActive) me llevará a "viaje en
      // curso" cuando el pasajero me confirme.
      await context.read<TripsRepository>().driverAccept(t.id);
      if (!mounted) return;
      setState(() => _acting = null);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Aceptación enviada. Espera que el pasajero confirme.'),
      ));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _acting = null;
        });
      }
    }
  }

  /// Confirma la aceptación del pasajero sobre mi propuesta.
  /// Backend: PUT /api/trips/{tripId}/confirm-acceptance/{proposalId}
  /// Al confirmar:
  ///   - Se asigna el conductor y el viaje pasa a Accepted.
  ///   - Mis OTRAS propuestas pending en otros viajes se rechazan (driver_busy).
  ///   - Navego a /driver/trip-in-progress para empezar el viaje.
  Future<void> _confirmAcceptance(Trip t, String proposalId) async {
    setState(() {
      _acting = t.id;
      _error = null;
    });
    try {
      await context.read<TripsRepository>().confirmAcceptance(t.id, proposalId);
      if (!mounted) return;
      context.go('/driver/trip-in-progress');
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _acting = null;
        });
      }
    }
  }

  TextEditingController _ctrlFor(Trip t) {
    return _proposeCtrl.putIfAbsent(
      t.id,
      () => TextEditingController(text: t.estimatedFare.toStringAsFixed(2)),
    );
  }

  Future<void> _submitProposal(Trip t) async {
    final ctrl = _ctrlFor(t);
    final fare = double.tryParse(ctrl.text.replaceAll(',', '.'));
    if (fare == null || fare <= 0) {
      setState(() => _error = 'Ingresa una tarifa válida.');
      return;
    }
    setState(() {
      _acting = t.id;
      _error = null;
    });
    try {
      await context.read<TripsRepository>().proposeFare(t.id, fare);
      if (!mounted) return;
      // Cerrar panel y refrescar — el banner azul aparecerá en el próximo poll.
      setState(() {
        _proposingId = null;
        _acting = null;
      });
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _acting = null;
        });
      }
    }
  }

  /// Modal con mi historial de propuestas para este viaje.
  /// Reutiliza /proposals/history?driverId=X filtrando con mi propio userId.
  Future<void> _openHistory(String tripId) async {
    final myUserId = context.read<Session>().user?.userId;
    if (myUserId == null) return;
    await showDialog(
      context: context,
      builder: (_) => DriverHistoryDialog(
        tripId: tripId,
        myUserId: myUserId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Solicitudes entrantes'),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
                  children: [
                    // Banner "sin conexión" — aparece tras 2+ fallos seguidos.
                    // Visible en cualquier estado (con o sin solicitudes).
                    if (_isOffline) ...[
                      _OfflineBanner(
                          lastSuccessAt: _lastSuccessAt, onRetry: _load),
                      const SizedBox(height: 12),
                    ],

                    if (_error != null)
                      Container(
                        padding: const EdgeInsets.all(10),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(_error!,
                            style: const TextStyle(
                                color: BugieColors.danger, fontSize: 13)),
                      ),

                    if (_trips.isEmpty)
                      _buildEmptyContent()
                    else ...[
                      // Posición actual del conductor (leída UNA vez por build,
                      // no hace petición — viene de LocationTrackingService).
                      Builder(builder: (ctx) {
                        final lastPos = ctx
                            .read<LocationTrackingService>()
                            .lastKnownPosition;
                        final driverPos = lastPos == null
                            ? null
                            : LatLng(lastPos.latitude, lastPos.longitude);
                        // ¿Tengo alguna propuesta de algún viaje esperando mi
                        // confirmación? Si sí, bloqueo los botones normales en
                        // TODAS las OTRAS tarjetas. La tarjeta con la propuesta
                        // esperando mantiene su botón "Confirmar y empezar viaje".
                        final waitingEntries = _counters.entries
                            .where((e) => e.value.isWaitingMyConfirmation)
                            .toList();
                        final waitingTripId = waitingEntries.isNotEmpty
                            ? waitingEntries.first.key
                            : null;
                        return Column(
                          children: _trips.map((t) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: TripRequestCardCompact(
                              trip: t,
                              counter: _counters[t.id],
                              // Distancia conductor → origen del viaje.
                              // Si no tenemos GPS, queda en null y la card
                              // simplemente no muestra la pill "a X km".
                              distanceToOriginKm: driverPos == null
                                  ? null
                                  : haversineKm(
                                      driverPos,
                                      LatLng(t.originLat, t.originLng),
                                    ),
                              onTap: () {
                                // Navegamos al detalle. Al volver, refrescamos
                                // la lista por si negociaron algo allá adentro.
                                context.push(
                                  '/driver/incoming/${t.id}',
                                ).then((_) {
                                  if (mounted) _load();
                                });
                              },
                            ),
                          )).toList(),
                        );
                      }),
                    ],
                      ],
                    ),
                  ),
      ),
    );
  }

  /// Contenido del estado vacío. Se inserta como un hijo más del ListView
  /// (no como pantalla completa) para que conviva con el banner offline.
  Widget _buildEmptyContent() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.search,
                size: 56, color: BugieColors.textMuted),
            const SizedBox(height: 12),
            const Text('Sin solicitudes por ahora',
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            const Text(
              'Las nuevas solicitudes aparecen aquí automáticamente.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: BugieColors.textMuted, fontSize: 13),
            ),
          ],
        ),
      );
}

// ─────────────────────────────────────────────────────────────────────────
// Card de cada solicitud + banner de negociación
// ─────────────────────────────────────────────────────────────────────────

class TripRequestCard extends StatelessWidget {
  final Trip trip;
  final DriverCounterInfo? counter;
  final bool hideRejected;
  final bool isActing;
  final bool isProposing;
  final TextEditingController proposeController;
  /// Última posición conocida del conductor (de LocationTrackingService).
  /// Puede ser null si todavía no ha enviado ninguna ubicación.
  final LatLng? driverPosition;
  /// Ruta cacheada del viaje. Vacía si todavía no se calculó.
  final List<LatLng> routePoints;
  /// Si false, NO renderiza el mini-mapa interno. Útil cuando se usa el
  /// card en una pantalla que ya tiene un mapa fullscreen de fondo.
  final bool showMap;
  final VoidCallback onAccept;
  final VoidCallback onDecline;
  final VoidCallback onTogglePropose;
  final VoidCallback onSubmitPropose;
  final VoidCallback onCancelPropose;
  final VoidCallback onHideRejected;
  final VoidCallback onOpenHistory;
  /// Callback al confirmar la aceptación del pasajero. Solo aplica cuando
  /// counter está en estado 'accepted_by_passenger' (banner verde con botón
  /// "Confirmar y empezar viaje").
  final VoidCallback onConfirmAcceptance;
  /// Si es true, todos los botones de acción (aceptar, proponer, declinar)
  /// quedan deshabilitados porque YA TENGO una propuesta de OTRO viaje
  /// esperando que yo confirme. Solo el botón "Confirmar y empezar viaje"
  /// del viaje correspondiente sigue funcionando.
  final bool blockedByOtherWaitingConfirmation;

  const TripRequestCard({
    super.key,
    required this.trip,
    required this.counter,
    required this.hideRejected,
    required this.isActing,
    required this.isProposing,
    required this.proposeController,
    required this.driverPosition,
    required this.routePoints,
    required this.onAccept,
    required this.onDecline,
    required this.onTogglePropose,
    required this.onSubmitPropose,
    required this.onCancelPropose,
    required this.onHideRejected,
    required this.onOpenHistory,
    required this.onConfirmAcceptance,
    this.blockedByOtherWaitingConfirmation = false,
    this.showMap = true,
  });

  String _payLabel(String m) {
    switch (m) {
      case 'cash': return 'Efectivo';
      case 'yape': return 'Yape';
      case 'plin': return 'Plin';
      default:     return m.toUpperCase();
    }
  }

  String _timeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'ahora';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    return 'hace ${diff.inHours} h';
  }

  @override
  Widget build(BuildContext context) {
    final sortedWp = [...trip.waypoints]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    // Mostrar el banner viejo (naranja/azul/rojo) solo si NO está en estado
    // 'accepted_by_passenger'. En ese caso, el banner verde de los botones
    // ya muestra toda la info y agregar otro arriba sería redundante.
    final showBanner = counter != null
        && !counter!.isWaitingMyConfirmation
        && !(counter!.isRejected && hideRejected);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                const Icon(Icons.route,
                    size: 18, color: BugieColors.accent),
                const SizedBox(width: 6),
                // Expanded: absorbe el ancho sobrante para que el header NUNCA
                // desborde (el 'error de píxeles' que se veía al lado del tiempo).
                Expanded(
                  child: Row(
                    children: [
                      const Flexible(
                        child: Text('Solicitud',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                      if (trip.isDelivery) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: BugieColors.accent.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text('Envio',
                              style: TextStyle(
                                  color: BugieColors.accent,
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(_timeAgo(trip.createdAt),
                    style: const TextStyle(
                        fontSize: 11, color: BugieColors.textMuted)),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: context.bugie.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: context.bugie.border),
                  ),
                  child: Text(_payLabel(trip.paymentMethod),
                      style: const TextStyle(fontSize: 11)),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // ── Pasajero: foto + nombre (truncado) + botón historial ──
            Row(
              children: [
                _PassengerAvatar(
                    photoUrl: trip.passengerPhotoUrl,
                    name: trip.passengerName),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _shortPassengerName(trip.passengerName),
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: context.bugie.text),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Mi historial de propuestas',
                  icon: Icon(Icons.history, color: context.bugie.textMuted),
                  onPressed: isActing ? null : onOpenHistory,
                ),
              ],
            ),
            const SizedBox(height: 10),

            if (trip.isDelivery) ...[
              _DeliveryInfo(trip: trip),
              const SizedBox(height: 10),
            ],

            // Origen / paradas / destino
            _AddressRow(
                color: BugieColors.mapOrigin,
                label: 'Origen',
                address: trip.originAddress),
            ...sortedWp.asMap().entries.map((e) => Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: _AddressRow(
                    color: BugieColors.mapWaypoint,
                    label: 'Parada ${e.key + 1}',
                    address: e.value.address,
                  ),
                )),
            const SizedBox(height: 4),
            _AddressRow(
                color: BugieColors.mapDestination,
                label: 'Destino',
                address: trip.destAddress),
            const SizedBox(height: 12),

            // Mapa mini: ruta del viaje + posición del pasajero (origen) +
            // destino + auto del conductor (si tiene GPS). Misma estética
            // que el tracking del pasajero. La ruta viene cacheada del state
            // principal — solo se pide al backend una vez por viaje.
            // Se OMITE cuando showMap=false (ej. en la pantalla de detalle
            // que ya tiene un mapa fullscreen de fondo).
            if (showMap) ...[
              _DriverMiniMap(
                driverPosition: driverPosition,
                passengerOrigin: LatLng(trip.originLat, trip.originLng),
                destination: LatLng(trip.destLat, trip.destLng),
                routePoints: routePoints,
              ),
              const SizedBox(height: 12),
            ],

            // Tarifa del sistema
            Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Tarifa del sistema',
                        style: TextStyle(
                            fontSize: 11, color: BugieColors.textMuted)),
                    Text('S/ ${trip.estimatedFare.toStringAsFixed(2)}',
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold)),
                    if (sortedWp.isNotEmpty)
                      Text(
                        '${sortedWp.length} parada${sortedWp.length > 1 ? "s" : ""}',
                        style: const TextStyle(
                            fontSize: 11, color: BugieColors.textMuted),
                      ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Estado especial: el pasajero aceptó mi propuesta y espera que yo
            // confirme. Mostramos un banner verde grande con botón único de
            // "Confirmar y empezar viaje". Esto reemplaza los botones normales.
            if (counter != null && counter!.isWaitingMyConfirmation) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: BugieColors.success.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: BugieColors.success, width: 2),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.check_circle, color: BugieColors.success, size: 22),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '¡El pasajero aceptó tu propuesta!',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: BugieColors.success,
                              fontSize: 15,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Confirma para empezar el viaje por S/ ${counter!.fare.toStringAsFixed(2)}. '
                      'Al confirmar, tus demás solicitudes pendientes se rechazarán automáticamente.',
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: BugieColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BugieColors.success,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        onPressed: isActing ? null : onConfirmAcceptance,
                        icon: isActing
                            ? const SizedBox(
                                width: 16, height: 16,
                                child: CircularProgressIndicator(
                                    color: Colors.white, strokeWidth: 2),
                              )
                            : const Icon(Icons.play_arrow, size: 20),
                        label: const Text(
                          'Confirmar y empezar viaje',
                          style: TextStyle(
                              fontSize: 15, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ] else ...[
              // Botones normales: solo se muestran si NO hay propuesta esperando
              // mi confirmación en este viaje. Si hay otro viaje esperándome,
              // todos quedan deshabilitados (blockedByOtherWaitingConfirmation).
              if (blockedByOtherWaitingConfirmation) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: BugieColors.warning.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: BugieColors.warning.withOpacity(0.4)),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.lock, color: BugieColors.warning, size: 18),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Bloqueado: tienes otra propuesta esperando tu confirmación.',
                          style: TextStyle(
                              fontSize: 12.5, color: BugieColors.textMuted),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
              ],
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                        backgroundColor: BugieColors.success),
                    onPressed: (isActing || blockedByOtherWaitingConfirmation) ? null : onAccept,
                    icon: isActing
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2))
                        : const Icon(Icons.check, size: 16),
                    label: const Text('Aceptar'),
                  ),
                  OutlinedButton.icon(
                    onPressed: (isActing || blockedByOtherWaitingConfirmation) ? null : onTogglePropose,
                    icon: const Icon(Icons.local_offer, size: 16),
                    label: const Text('Proponer precio'),
                  ),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: BugieColors.textMuted,
                    ),
                    onPressed: isActing ? null : onDecline,
                    icon: const Icon(Icons.close, size: 16),
                    label: const Text('Declinar'),
                  ),
                ],
              ),
            ],

            // Panel "proponer tarifa" inline
            if (isProposing) ...[
              const SizedBox(height: 12),
              _ProposePanel(
                trip: trip,
                isActing: isActing,
                controller: proposeController,
                onSubmit: onSubmitPropose,
                onCancel: onCancelPropose,
              ),
            ],

            // Banner de negociación (naranja / azul / rojo)
            if (showBanner) ...[
              const SizedBox(height: 12),
              _NegotiationBanner(
                counter: counter!,
                onHide: onHideRejected,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Banner que muestra el estado de la negociación con el pasajero
// ─────────────────────────────────────────────────────────────────────────

class _NegotiationBanner extends StatelessWidget {
  final DriverCounterInfo counter;
  final VoidCallback onHide;
  const _NegotiationBanner({required this.counter, required this.onHide});

  @override
  Widget build(BuildContext context) {
    final c = counter;

    // Color, ícono y texto según el tipo de banner.
    late final Color color;
    late final IconData icon;
    late final String title;
    late final String montoLabel;
    late final String helpText;
    bool strikeThrough = false;

    if (c.isCounterFromPassenger) {
      color = Colors.orange;
      icon = Icons.swap_horiz;
      title = 'Contrapropuesta del pasajero';
      montoLabel = 'El pasajero propone:';
      helpText =
          'Si te conviene, usa "Proponer precio" con el mismo monto S/ ${c.fare.toStringAsFixed(2)}. '
          'Si no, propón otro monto o declina.';
    } else if (c.isMyPending) {
      color = BugieColors.primary;
      icon = Icons.hourglass_bottom;
      title = 'Esperando respuesta del pasajero';
      montoLabel = 'Tu propuesta vigente:';
      helpText =
          'El pasajero está revisando tu propuesta. Puedes modificarla enviando otra con "Proponer precio".';
    } else {
      color = BugieColors.danger;
      icon = Icons.block;
      title = 'El pasajero rechazó tu propuesta';
      montoLabel = 'Tu propuesta rechazada:';
      helpText =
          'Puedes enviar otra propuesta usando "Proponer precio" o esperar. También puedes cerrar este aviso con la X.';
      strikeThrough = true;
    }

    final timeText = _timeAgo(c.createdAt);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Stack(
        children: [
          if (c.isRejected)
            Positioned(
              top: -8,
              right: -8,
              child: IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Ocultar aviso',
                icon: const Icon(Icons.close, size: 16),
                onPressed: onHide,
              ),
            ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Badge título + tiempo
              Row(
                children: [
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(icon, size: 12, color: Colors.white),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(title,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Padding(
                    padding: const EdgeInsets.only(right: 24),
                    child: Text(timeText,
                        style: TextStyle(
                            fontSize: 11, color: context.bugie.textMuted)),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Monto
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(montoLabel,
                      style: const TextStyle(
                          fontSize: 12, color: BugieColors.textMuted)),
                  const SizedBox(width: 6),
                  Text(
                    'S/ ${c.fare.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: color,
                      decoration:
                          strikeThrough ? TextDecoration.lineThrough : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(helpText,
                  style: const TextStyle(
                      fontSize: 11, color: BugieColors.textMuted)),
            ],
          ),
        ],
      ),
    );
  }

  String _timeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'ahora';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    return 'hace ${diff.inHours} h';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Modal "Mi historial" del conductor
// ─────────────────────────────────────────────────────────────────────────

class DriverHistoryDialog extends StatefulWidget {
  final String tripId;
  final String myUserId;
  const DriverHistoryDialog({required this.tripId, required this.myUserId});

  @override
  State<DriverHistoryDialog> createState() => DriverHistoryDialogState();
}

class DriverHistoryDialogState extends State<DriverHistoryDialog> {
  List<ProposalHistoryEntry> _entries = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await context
          .read<TripsRepository>()
          .getProposalHistory(widget.tripId, widget.myUserId);
      if (mounted) setState(() { _entries = list; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Color _colorForStatus(String s) {
    switch (s) {
      case 'pending':    return BugieColors.primary;
      case 'superseded': return BugieColors.statusSuperseded;
      case 'accepted':   return BugieColors.success;
      case 'rejected':   return BugieColors.danger;
      default:           return BugieColors.textMuted;
    }
  }

  String _timeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inSeconds < 60) return 'hace ${diff.inSeconds}s';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    if (diff.inHours < 24)   return 'hace ${diff.inHours} h';
    return 'hace ${diff.inDays} d';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Dialog(
      backgroundColor: c.surface,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440, maxHeight: 560),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
              decoration: BoxDecoration(
                border: Border(
                    bottom: BorderSide(color: context.bugie.border)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.history, size: 18),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Mi historial de propuestas',
                      style: TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Todas las propuestas enviadas en esta negociación. Solo visual.',
                      style: TextStyle(
                          fontSize: 12, color: BugieColors.textMuted),
                    ),
                    const SizedBox(height: 12),
                    if (_loading)
                      const Center(
                          child: Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(),
                      ))
                    else if (_entries.isEmpty)
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('Aún no has enviado propuestas.',
                              style: TextStyle(color: BugieColors.textMuted)),
                        ),
                      )
                    else
                      ..._entries.map((h) {
                        final color = _colorForStatus(h.status);
                        final isCounter = h.proposedByRole == 'passenger';
                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: context.bugie.surface,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Opacity(
                            opacity: h.status == 'pending' ? 1 : 0.75,
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'S/ ${h.fare.toStringAsFixed(2)}',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 16),
                                      ),
                                      Row(
                                        children: [
                                          if (isCounter) ...[
                                            const Icon(Icons.swap_horiz,
                                                size: 12, color: Colors.orange),
                                            const SizedBox(width: 4),
                                            const Text(
                                              'Contrapropuesta del pasajero',
                                              style: TextStyle(
                                                  fontSize: 11,
                                                  color: Colors.orange,
                                                  fontWeight: FontWeight.w600),
                                            ),
                                            const SizedBox(width: 6),
                                          ],
                                          Text(
                                            _timeAgo(h.createdAt),
                                            style: const TextStyle(
                                                fontSize: 11,
                                                color: BugieColors.textMuted),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: color,
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Text(
                                    h.statusLabel,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                    const SizedBox(height: 8),
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.info_outline,
                              size: 14, color: BugieColors.textMuted),
                          SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              '"Modificada" significa que enviaste una nueva propuesta después de ella.',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: BugieColors.textMuted),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Panel inline "proponer tarifa"
// ─────────────────────────────────────────────────────────────────────────

class _ProposePanel extends StatelessWidget {
  final Trip trip;
  final bool isActing;
  final TextEditingController controller;
  final VoidCallback onSubmit;
  final VoidCallback onCancel;

  const _ProposePanel({
    required this.trip,
    required this.isActing,
    required this.controller,
    required this.onSubmit,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.bugie.surface,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Icon(Icons.local_offer, size: 14, color: BugieColors.accent),
              SizedBox(width: 6),
              Text('Proponer tarifa al pasajero',
                  style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    prefixText: 'S/ ',
                    isDense: true,
                    hintText: trip.estimatedFare.toStringAsFixed(2),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: isActing ? null : onSubmit,
                child: isActing
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('Enviar'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: isActing ? null : onCancel,
            style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: const Size(0, 0),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap),
            child:
                const Text('Cancelar', style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

class _AddressRow extends StatelessWidget {
  final Color color;
  final String label;
  final String address;
  const _AddressRow({
    required this.color,
    required this.label,
    required this.address,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: TextStyle(fontSize: 13, color: context.bugie.text),
              children: [
                TextSpan(
                  text: '$label: ',
                  style: const TextStyle(color: BugieColors.textMuted),
                ),
                TextSpan(
                  text: address,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Banner "sin conexión" (idéntico al del pasajero, replicado para no
// crear dependencia cruzada entre módulos).
// ─────────────────────────────────────────────────────────────────────────

class _OfflineBanner extends StatelessWidget {
  final DateTime? lastSuccessAt;
  final VoidCallback onRetry;
  const _OfflineBanner({required this.lastSuccessAt, required this.onRetry});

  String _staleText() {
    if (lastSuccessAt == null) return 'sin actualizar';
    final diff = DateTime.now().difference(lastSuccessAt!);
    if (diff.inSeconds < 60) return 'hace ${diff.inSeconds}s';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    return 'hace ${diff.inHours} h';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.orange.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off, color: Colors.orange, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Sin conexión',
                  style: TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 13),
                ),
                Text(
                  'Última actualización ${_staleText()}',
                  style: const TextStyle(
                      fontSize: 11, color: BugieColors.textMuted),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              foregroundColor: Colors.orange,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              minimumSize: const Size(0, 32),
            ),
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Reintentar',
                style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Mapa mini para mostrar al conductor su posición vs el origen del pasajero.
// Reusa BugieMap pero con altura reducida y sin la barra de info.
// Si todavía no se conoce la posición del conductor (lastKnownPosition null),
// solo muestra el pin del pasajero/origen.
// ─────────────────────────────────────────────────────────────────────────

class _DriverMiniMap extends StatelessWidget {
  /// Última posición conocida del conductor. Null si todavía no envió ninguna.
  final LatLng? driverPosition;
  /// Origen del pasajero (a dónde tiene que ir el conductor).
  final LatLng passengerOrigin;
  /// Destino del viaje (informativo, mostrado en rojo).
  final LatLng destination;
  /// Polilínea de la ruta entre origen y destino. Vacía si todavía no se
  /// calculó (se ve solo origen, destino y conductor sin línea).
  final List<LatLng> routePoints;

  const _DriverMiniMap({
    required this.driverPosition,
    required this.passengerOrigin,
    required this.destination,
    required this.routePoints,
  });

  @override
  Widget build(BuildContext context) {
    final markers = <BugieMarker>[
      // El pin azul (origen del pasajero) es el más importante: a dónde voy.
      BugieMarker(
        position: passengerOrigin,
        kind: MarkerKind.origin,
      ),
      // El destino lo marcamos también para contexto.
      BugieMarker(
        position: destination,
        kind: MarkerKind.destination,
      ),
      // Si tenemos la posición del conductor, la pintamos con el ícono de auto
      // verde (mismo visual que usa el pasajero en su tracking).
      if (driverPosition != null)
        BugieMarker(
          position: driverPosition!,
          kind: MarkerKind.driver,
        ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Leyenda compacta para que el conductor entienda los colores.
        Row(
          children: [
            _LegendDot(color: BugieColors.mapOrigin, label: 'Pasajero'),
            const SizedBox(width: 8),
            _LegendDot(color: BugieColors.mapDestination, label: 'Destino'),
            if (driverPosition != null) ...[
              const SizedBox(width: 8),
              _LegendDot(color: BugieColors.success, label: 'Tú'),
            ],
          ],
        ),
        const SizedBox(height: 6),
        BugieMap(
          height: 200,
          markers: markers,
          // Ruta del viaje (origen → destino). Si está vacía, no se dibuja.
          route: routePoints,
          // Centro inicial: el origen del pasajero. fitBoundsOnMarkers ajusta
          // automáticamente para que todos los pines y la ruta entren.
          center: passengerOrigin,
          fitBoundsOnMarkers: true,
        ),
        if (driverPosition == null) ...[
          const SizedBox(height: 4),
          const Row(
            children: [
              Icon(Icons.info_outline, size: 11, color: BugieColors.textMuted),
              SizedBox(width: 4),
              Expanded(
                child: Text(
                  'Tu ubicación aún no está disponible. Espera unos segundos.',
                  style: TextStyle(
                      fontSize: 10, color: BugieColors.textMuted),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendDot({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(label,
            style: const TextStyle(
                fontSize: 10, color: BugieColors.textMuted)),
      ],
    );
  }
}

class _DeliveryInfo extends StatelessWidget {
  final Trip trip;
  const _DeliveryInfo({required this.trip});

  @override
  Widget build(BuildContext context) {
    final parts = <String>[];
    if (trip.packageWeightKg != null) parts.add('${trip.packageWeightKg} kg');
    if (trip.packageIsFragile) parts.add('Fragil');
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: BugieColors.accent.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: BugieColors.accent.withOpacity(0.30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.inventory_2_outlined, size: 16, color: BugieColors.accent),
              const SizedBox(width: 6),
              const Text('Paquete',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              if (parts.isNotEmpty) ...[
                const SizedBox(width: 6),
                Expanded(
                  child: Text('- ${parts.join('  -  ')}',
                      style: const TextStyle(fontSize: 12, color: BugieColors.textMuted),
                      overflow: TextOverflow.ellipsis),
                ),
              ],
            ],
          ),
          if ((trip.packageDescription ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(trip.packageDescription!, style: const TextStyle(fontSize: 12)),
          ],
        ],
      ),
    );
  }
}

/// Nombre del pasajero recortado por privacidad: 4 letras + "..." en nombre y
/// apellido (ej: "Juan Pérez" -> "Juan... Pére...").
String _shortPassengerName(String? full) {
  if (full == null || full.trim().isEmpty) return 'Pasajero';
  final parts = full.trim().split(RegExp(r'\s+'));
  String trunc(String s) => s.length <= 4 ? s : '${s.substring(0, 4)}...';
  final first = trunc(parts.first);
  final last = parts.length > 1 ? trunc(parts.last) : '';
  return last.isEmpty ? first : '$first $last';
}

/// Avatar del pasajero: su foto (si tiene) con fallback a iniciales.
class _PassengerAvatar extends StatelessWidget {
  final String? photoUrl;
  final String? name;
  final double size;
  const _PassengerAvatar({required this.photoUrl, required this.name, this.size = 40});

  @override
  Widget build(BuildContext context) {
    final initials = (name ?? '')
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((s) => s.isEmpty ? '' : s[0].toUpperCase())
        .join();

    final fallback = Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: BugieColors.primary,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: const TextStyle(
            color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
      ),
    );

    // La foto del pasajero vive en Auth (auth.Users.ProfilePhotoUrl).
    final resolved =
        ApiConfig.resolveMediaUrl(photoUrl, service: ApiService.auth);
    if (resolved == null || resolved.isEmpty) return fallback;

    return ClipOval(
      child: Image.network(
        resolved,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => fallback,
        loadingBuilder: (ctx, child, progress) =>
            progress == null ? child : fallback,
      ),
    );
  }
}
