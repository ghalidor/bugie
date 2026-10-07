import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/active_trip_service.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/services/trips_hub_service.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/proposal_model.dart';
import '../../trips/domain/trip_model.dart';
import '../../trips/domain/trip_photo_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../../core/widgets/negotiation/negotiation.dart';
import 'driver_idle_tracking.dart';
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
  /// false cuando se muestra como pestaña del menú inferior (sin botón volver).
  final bool showBack;
  const IncomingRequestsScreen({super.key, this.showBack = true});

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


  /// Cache de rutas calculadas por tripId. Se llena la primera vez que vemos
  /// una solicitud y se reutiliza en cada poll. Si el viaje desaparece de la
  /// lista (rechazado/aceptado por otro), se purga. Evita pedir la ruta
  /// repetidamente a /api/trips/route en cada poll.
  final Map<String, List<LatLng>> _routeCache = {};

  /// Cantidad de fotos del paquete por tripId (solo envíos). Se pide UNA vez
  /// por solicitud y se reutiliza en cada poll, igual que las rutas.
  final Map<String, int> _photoCountCache = {};

  /// True si hay problemas de red sostenidos (2+ fallos seguidos).
  bool get _isOffline => _failureCount >= 2;

  /// IDs vistos en el último poll (para marcar las solicitudes "nuevas").
  Set<String>? _knownIds;
  /// Momento en que apareció cada solicitud nueva. El badge "Nuevo" dura
  /// [_newBadgeFor] o hasta que el conductor la abre.
  final Map<String, DateTime> _newSince = {};
  static const _newBadgeFor = Duration(minutes: 2);

  bool _isNew(String id) {
    final since = _newSince[id];
    return since != null && DateTime.now().difference(since) < _newBadgeFor;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Las solicitudes se filtran por la posición del conductor en el backend:
    // nos aseguramos de que se esté enviando (si está en línea).
    ensureDriverIdleTracking(context);
    ActiveTripService().active.addListener(_onActiveTrip);
    // Push de un viaje (oferta aceptada, eligió a otro, venció tu
    // confirmación, cancelado...): recargar la lista.
    FcmService.tripEvent.addListener(_onTripPush);
    // Tiempo real (hub): solicitudes nuevas/tomadas/retiradas y cambios en
    // mis ofertas → misma recarga del polling.
    final hub = TripsHubService();
    hub.joinDriverRequests();
    hub.connected.addListener(_onHubState);
    hub.requestsChanged.addListener(_onHubRequestsChanged);
    hub.proposalsChanged.addListener(_onHubChanged);
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
    ActiveTripService().active.removeListener(_onActiveTrip);
    FcmService.tripEvent.removeListener(_onTripPush);
    final hub = TripsHubService();
    hub.connected.removeListener(_onHubState);
    hub.requestsChanged.removeListener(_onHubRequestsChanged);
    hub.proposalsChanged.removeListener(_onHubChanged);
    hub.leaveDriverRequests();
    _pollingTimer?.cancel();
    _staleTickTimer?.cancel();
    super.dispose();
  }

  void _onActiveTrip() {
    if (mounted) setState(() {});
  }

  void _onTripPush() {
    final e = FcmService.tripEvent.value;
    if (!mounted || e == null) return;
    // Cancelada o tomada por otro: se quita ya, sin esperar la recarga.
    if (e.type == 'trip_cancelled' || e.type == 'offer_not_chosen') {
      _removeLocally(e.tripId);
    }
    _load();
  }

  /// Solicitud tomada, retirada (cancelada por el pasajero) o vencida: la
  /// tarjeta sale al instante; la recarga confirma el resto de la lista.
  void _onHubRequestsChanged() {
    final e = TripsHubService().requestsChanged.value;
    if (!mounted) return;
    if (e != null &&
        (e.reason == 'taken' ||
            e.reason == 'withdrawn' ||
            e.reason == 'cancelled')) {
      _removeLocally(e.tripId);
    }
    _load();
  }

  void _removeLocally(String? tripId) {
    if (tripId == null || !_trips.any((t) => t.id == tripId)) return;
    setState(() {
      _trips = _trips.where((t) => t.id != tripId).toList();
      _counters = Map.of(_counters)..remove(tripId);
      _newSince.remove(tripId);
    });
  }

  /// Hub (re)conectado: recarga completa. Hub caído: polling corto.
  void _onHubState() {
    if (!mounted) return;
    if (TripsHubService().connected.value) {
      _load();
    } else {
      _scheduleNext();
    }
  }

  void _onHubChanged() {
    if (mounted) _load();
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
    // Con el hub conectado los cambios llegan al instante: solo respaldo.
    if (TripsHubService().connected.value) return const Duration(seconds: 30);
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

    // ¿Tengo un viaje activo? Ya NO se salta solo a "viaje en curso": la
    // franja fija "Viaje en curso · Volver" lo lleva, y aquí se muestra un
    // aviso (ver _ActiveTripNotice). Seguimos viendo la lista.
    unawaited(ActiveTripService().refresh());

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
        // Marca como "nuevas" las que no estaban en el poll anterior.
        final ids = list.map((t) => t.id).toSet();
        final now = DateTime.now();
        if (_knownIds != null) {
          for (final id in ids.difference(_knownIds!)) {
            _newSince[id] = now;
          }
        }
        _knownIds = ids;
        _newSince.removeWhere((id, _) => !ids.contains(id));
        // Más recientes primero (solo cambia el orden en pantalla).
        list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
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
        _syncPhotoCountCache(list);
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
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _failureCount = (_failureCount + 1).clamp(0, 10);
          _error = 'No se pudieron cargar las solicitudes.';
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

  /// Igual que `_syncRouteCache`, pero con la cantidad de fotos del paquete
  /// de cada envío. Si falla, queda sin dato y se reintenta en el próximo poll.
  Future<void> _syncPhotoCountCache(List<Trip> trips) async {
    final liveIds = trips.map((t) => t.id).toSet();
    _photoCountCache.removeWhere((id, _) => !liveIds.contains(id));

    final missing = trips
        .where((t) => t.isDelivery && !_photoCountCache.containsKey(t.id))
        .toList();
    if (missing.isEmpty) return;

    final repo = context.read<TripsRepository>();
    for (final t in missing) {
      try {
        final photos = await repo.getPhotos(t.id);
        if (!mounted) return;
        _photoCountCache[t.id] =
            photos.where((p) => p.kind == TripPhotoKind.package).length;
        setState(() {});
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BugieInternalHeader(title: 'Solicitudes', showBack: widget.showBack),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
                  children: [
                    // Con un viaje activo no puede aceptar otras solicitudes
                    // (puede ver la lista y su detalle).
                    if (ActiveTripService().hasActive) ...[
                      ActiveTripNotice(
                        isDelivery:
                            ActiveTripService().active.value!.isDelivery,
                      ),
                      const SizedBox(height: 12),
                    ],

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
                        return AnimatedItemsColumn<Trip>(
                          items: _trips,
                          keyOf: (t) => t.id,
                          spacing: 10,
                          itemBuilder: (ctx, t, _) {
                            final counter = _counters[t.id];
                            return TripRequestCardCompact(
                              trip: t,
                              counter: counter,
                              photoCount: _photoCountCache[t.id],
                              isNew: _isNew(t.id),
                              onExpired: _load,
                              // Distancia conductor → origen del viaje.
                              // Si no tenemos GPS, queda en null y la card
                              // simplemente no muestra el chip "a X km".
                              distanceToOriginKm: driverPos == null
                                  ? null
                                  : haversineKm(
                                      driverPos,
                                      LatLng(t.originLat, t.originLng),
                                    ),
                              onTap: () {
                                setState(() => _newSince.remove(t.id));
                                // Navegamos al detalle. Al volver, refrescamos
                                // la lista por si negociaron algo allá adentro.
                                context.push(
                                  '/driver/incoming/${t.id}',
                                ).then((_) {
                                  if (mounted) _load();
                                });
                              },
                            );
                          },
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
          // Botón tonal (como la acción de AlertBanner): fondo del color
          // del aviso, radio 8, alto 32.
          TextButton.icon(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              foregroundColor: Colors.orange.shade800,
              backgroundColor: Colors.orange.withValues(alpha: 0.18),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              minimumSize: const Size(0, 32),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Reintentar',
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

/// Nombre del pasajero recortado por privacidad: primer nombre completo +
/// inicial del apellido paterno (ej: "Jorge Luis Alvarez Ruiz" -> "Jorge A.").
/// El nombre completo viene como "nombres paterno materno": con 3+ palabras
/// el paterno es la penúltima; con 2, la última; con 1, se muestra tal cual.
/// Si el backend manda [shortName] (passengerShortName) se usa ese; el
/// cálculo desde el nombre completo queda como respaldo.
String shortPassengerName(String? full, {String? shortName}) {
  if (shortName != null && shortName.trim().isNotEmpty) return shortName.trim();
  if (full == null || full.trim().isEmpty) return 'Pasajero';
  final parts = full.trim().split(RegExp(r'\s+'));
  if (parts.length == 1) return parts.first;
  final paternal = parts.length >= 3 ? parts[parts.length - 2] : parts.last;
  return '${parts.first} ${paternal[0].toUpperCase()}.';
}

/// Avatar del pasajero: su foto (si tiene) con fallback a iniciales.
class PassengerAvatar extends StatelessWidget {
  final String? photoUrl;
  final String? name;
  final double size;
  const PassengerAvatar(
      {super.key, required this.photoUrl, required this.name, this.size = 40});

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

/// Aviso "Tienes un viaje en curso" de Solicitudes y del detalle: mientras
/// haya un viaje activo no se pueden aceptar ni proponer otras solicitudes.
/// Al tocarlo abre la pantalla del viaje.
class ActiveTripNotice extends StatelessWidget {
  final bool isDelivery;
  const ActiveTripNotice({super.key, this.isDelivery = false});

  static String message(bool isDelivery) => isDelivery
      ? 'Tienes un envío en curso: termínalo para aceptar otras solicitudes.'
      : 'Tienes un viaje en curso: termínalo para aceptar otras solicitudes.';

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Material(
      color: BugieColors.warning.withValues(alpha: 0.12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: BugieColors.warning.withValues(alpha: 0.5)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: ActiveTripService().openTrip,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          child: Row(
            children: [
              const Icon(Icons.info_outline_rounded,
                  color: BugieColors.warning, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message(isDelivery),
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: c.text),
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
