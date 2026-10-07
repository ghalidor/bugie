import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'driver_delivery_confirmation_screen.dart';
import 'driver_idle_tracking.dart';
import 'driver_pickup_verification_screen.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/active_trip_service.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/services/trips_hub_service.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/ui/app_messenger.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../../core/widgets/delivery_info.dart';
import '../../../core/widgets/service_badge.dart';
import '../../../core/widgets/trip_photos_gallery.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/route_model.dart';
import '../../trips/domain/trip_model.dart';
import '../data/driver_repository.dart';
import '../../../core/widgets/bugie_internal_header.dart';

class TripInProgressScreen extends StatefulWidget {
  const TripInProgressScreen({super.key});

  @override
  State<TripInProgressScreen> createState() => _TripInProgressScreenState();
}

class _TripInProgressScreenState extends State<TripInProgressScreen> {
  Trip? _trip;
  RouteInfo? _routeInfo;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  String? _lastRouteKey;

  /// id del viaje al que cambiamos el modo del tracking.
  /// Lo guardamos para incluirlo en cada update y que el backend
  /// inserte el historial (LocationHistory) durante el viaje.
  String? _trackingTripId;

  /// Última posición del conductor para pintar en el mapa. Se refresca con
  /// un timer corto (2s) que lee `lastKnownPosition` del tracking service.
  /// El tracking service en sí envía cada 5-15s según el modo, pero el
  /// pin local lo actualizamos más seguido por suavidad visual.
  LatLng? _myPosition;
  Timer? _myPositionTimer;

  /// Refresco del viaje cada 10 s (30 s con el hub conectado): si el
  /// pasajero cancela, el conductor se entera aunque no le llegue el push.
  Timer? _pollTimer;

  /// Viaje al que estamos suscritos en el hub (tiempo real).
  String? _hubTripId;

  /// Ya se resolvio el final del viaje (evita avisos dobles).
  bool _endHandled = false;

  @override
  void initState() {
    super.initState();
    // Mientras esta pantalla esté abierta se oculta la franja
    // "Viaje en curso · Volver".
    ActiveTripService().tripScreens.value++;
    _load();
    _startPollTimer();
    FcmService.tripCancelled.addListener(_poll);
    // Tiempo real (hub): cambios del viaje → mismo refresco del polling.
    final hub = TripsHubService();
    hub.connected.addListener(_onHubState);
    hub.tripChanged.addListener(_onHubTripChanged);
    // Tick local para refrescar la posición del pin del conductor en el mapa.
    // No envía nada al backend; solo lee el último valor del tracking service.
    _myPositionTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (!mounted) return;
      final tracking = context.read<LocationTrackingService>();
      final pos = tracking.lastKnownPosition;
      if (pos == null) return;
      final next = LatLng(pos.latitude, pos.longitude);
      // Solo rebuild si la posición realmente cambió (evita repaints inútiles).
      if (_myPosition == null ||
          _myPosition!.latitude != next.latitude ||
          _myPosition!.longitude != next.longitude) {
        setState(() => _myPosition = next);
      }
    });
  }

  @override
  void dispose() {
    _myPositionTimer?.cancel();
    _pollTimer?.cancel();
    FcmService.tripCancelled.removeListener(_poll);
    final hub = TripsHubService();
    hub.connected.removeListener(_onHubState);
    hub.tripChanged.removeListener(_onHubTripChanged);
    _syncHubTrip(null);
    // Vuelve la franja (si el viaje sigue activo). Se consulta de nuevo por
    // si el viaje terminó o se canceló.
    final active = ActiveTripService();
    active.tripScreens.value = (active.tripScreens.value - 1).clamp(0, 99);
    active.refresh(force: true);
    // Al salir de la pantalla del viaje (completado / cancelado), el conductor
    // sigue ONLINE: volvemos al envío de GPS "en línea sin viaje" (cada 30s)
    // para que el backend le muestre las solicitudes cercanas a donde está.
    final tracking = context.read<LocationTrackingService>();
    if (tracking.isRunning && tracking.mode != TrackingMode.driverIdle) {
      startDriverIdleTracking(context);
    }
    super.dispose();
  }

  /// Configura el LocationTrackingService para que sus envíos incluyan
  /// el tripId actual (cuando hay) y use el modo indicado.
  /// En viaje los puntos se juntan y van en lote (cada 12s o 5 puntos).
  /// Como el envío depende del tripId, lo re-inyectamos al cambiar.
  void _switchTrackingTo(TrackingMode mode, {required String? tripId}) {
    final tracking = context.read<LocationTrackingService>();
    final repo = context.read<DriverRepository>();
    _trackingTripId = tripId;

    if (!tracking.isRunning) {
      // Caso defensivo: si el conductor entró aquí sin pasar por go-online
      // (ej: reload de la app con sesión guardada), iniciamos nosotros.
      tracking.start(
        mode: mode,
        batchSender: (points) => repo.updateLocationBatch(
          points: points,
          tripId: _trackingTripId,
        ),
      );
    } else {
      // Reagenda el envío para que incluya el tripId actual.
      tracking.start(
        mode: mode,
        batchSender: (points) => repo.updateLocationBatch(
          points: points,
          tripId: _trackingTripId,
        ),
      );
      tracking.setMode(mode);
    }
  }

  Future<void> _load() async {
    try {
      final t = await context.read<TripsRepository>().getActive();
      if (!mounted) return;
      setState(() {
        _trip = t;
        _loading = false;
      });
      if (t != null) {
        // Conductor entró al viaje: subir frecuencia a 5s + tripId para historial.
        _switchTrackingTo(TrackingMode.driverInTrip, tripId: t.id);
        _maybeCalculateRoute(t);
        _syncHubTrip(t.id);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Tiempo real (hub de Trips) ──────────────────────────────────────────

  /// Suscribe al viaje en pantalla (y deja el anterior si cambió).
  void _syncHubTrip(String? tripId) {
    if (tripId == _hubTripId) return;
    final hub = TripsHubService();
    final prev = _hubTripId;
    if (prev != null) hub.leaveTrip(prev);
    _hubTripId = tripId;
    if (tripId != null) hub.joinTrip(tripId);
  }

  /// Polling de respaldo: 10 s sin hub, 30 s con el hub conectado.
  void _startPollTimer() {
    _pollTimer?.cancel();
    final seconds = TripsHubService().connected.value ? 30 : 10;
    _pollTimer = Timer.periodic(Duration(seconds: seconds), (_) => _poll());
  }

  /// Hub (re)conectado: refresco completo y polling largo. Caído: polling corto.
  void _onHubState() {
    if (!mounted) return;
    _startPollTimer();
    if (TripsHubService().connected.value) _poll();
  }

  void _onHubTripChanged() {
    final e = TripsHubService().tripChanged.value;
    if (mounted && e != null && e.tripId == _trip?.id) _poll();
  }

  String _routeKeyFor(Trip t) =>
      '${t.originLat},${t.originLng}-${t.destLat},${t.destLng}';

  Future<void> _maybeCalculateRoute(Trip t) async {
    final key = _routeKeyFor(t);
    if (key == _lastRouteKey) return;
    _lastRouteKey = key;

    try {
      final repo = context.read<TripsRepository>();
      final info = await repo.getRoute(
        originLat: t.originLat,
        originLng: t.originLng,
        destLat: t.destLat,
        destLng: t.destLng,
      );
      if (mounted) setState(() => _routeInfo = info);
    } catch (_) {}
  }

  Future<void> _start() async {
    if (_trip == null) return;
    // Envio: antes de "Paquete a bordo" hay que verificar el paquete.
    if (_trip!.isDelivery && !_trip!.pickupVerified) {
      final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => DriverPickupVerificationScreen(tripId: _trip!.id),
        ),
      );
      if (ok != true) return; // el conductor cancelo la verificacion
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final t = await context.read<TripsRepository>().start(_trip!.id);
      if (mounted) setState(() => _trip = t);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// "Ya llegué": avisa al pasajero (push) que el conductor está en el
  /// punto de recojo. Se puede repetir si el pasajero no sale.
  Future<void> _arrived() async {
    if (_trip == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<TripsRepository>().markArrived(_trip!.id);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Le avisamos al pasajero que ya llegaste.'),
        ));
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// El conductor cancela un viaje aceptado (antes de iniciarlo).
  /// Se pide el motivo: queda en el reporte como "cancelado por el conductor".
  Future<void> _cancelByDriver() async {
    if (_trip == null) return;
    const motivos = [
      'El pasajero no se presenta',
      'No puedo llegar al punto de recojo',
      'Problema con el vehículo',
      'El pasajero pidió cancelar',
      'Otro motivo',
    ];
    String elegido = motivos.first;
    final otroCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Cancelar viaje'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('¿Por qué cancelas? Se le avisará al pasajero.'),
              const SizedBox(height: 8),
              for (final m in motivos)
                RadioListTile<String>(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(m),
                  value: m,
                  groupValue: elegido,
                  onChanged: (v) => setD(() => elegido = v!),
                ),
              if (elegido == 'Otro motivo')
                TextField(
                  controller: otroCtrl,
                  maxLength: 200,
                  decoration:
                      const InputDecoration(hintText: 'Escribe el motivo'),
                ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Volver'),
            ),
            FilledButton(
              style:
                  FilledButton.styleFrom(backgroundColor: BugieColors.danger),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Cancelar viaje'),
            ),
          ],
        ),
      ),
    );
    final motivo = elegido == 'Otro motivo' ? otroCtrl.text.trim() : elegido;
    otroCtrl.dispose();
    if (ok != true || !mounted) return;

    _endHandled = true;
    setState(() {
      _busy = true;
      _error = null;
    });
    // Manda los puntos GPS que quedaron en cola con el tripId de este viaje.
    await context.read<LocationTrackingService>().flush();
    if (!mounted) return;
    try {
      final after = await context
          .read<TripsRepository>()
          .cancel(_trip!.id, reason: motivo.isEmpty ? 'Otro motivo' : motivo);
      if (!mounted) return;
      // Programado cancelado antes de su hora: el viaje se reabre para otro
      // conductor (ya no es mío) en vez de cancelarse.
      final reopened = after != null && after.driverId == null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(reopened
                ? 'Cancelaste el viaje programado; se buscará otro conductor.'
                : 'Viaje cancelado. Le avisamos al pasajero.')),
      );
      ActiveTripService().clear(); // sin franja: ya no hay viaje
      context.go('/driver');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _hhmm(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  /// Revisa si el viaje sigue activo. Si desaparece y fue cancelado por el
  /// pasajero (o por Bugie), avisa con el motivo y vuelve al inicio.
  Future<void> _poll() async {
    if (!mounted || _busy || _endHandled || _trip == null) return;
    final repo = context.read<TripsRepository>();
    final prevId = _trip!.id;
    try {
      final t = await repo.getActive();
      if (!mounted) return;
      if (t != null) {
        setState(() => _trip = t);
        return;
      }
      _endHandled = true;
      final fin = await repo.getById(prevId);
      if (!mounted) return;
      if (fin.status == TripStatus.cancelled && fin.cancelledBy != 'driver') {
        // Sigue en línea: vuelve al envío de GPS sin viaje.
        startDriverIdleTracking(context);
        await showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            icon: const Icon(Icons.cancel_outlined,
                size: 48, color: BugieColors.danger),
            title: Text(fin.cancelledBy == 'admin'
                ? 'Bugie canceló el viaje'
                : 'El pasajero canceló el viaje'),
            content: Text(
              '${fin.cancelReason != null ? 'Motivo: ${fin.cancelReason}\n\n' : ''}'
              'Ya puedes recibir otras solicitudes.',
              textAlign: TextAlign.center,
            ),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Entendido'),
              ),
            ],
          ),
        );
        if (mounted) {
          ActiveTripService().clear(); // sin franja: ya no hay viaje
          context.go('/driver');
        }
      }
    } catch (_) {
      // sin red: se reintenta en el proximo tick
      _endHandled = false;
    }
  }

  /// Hoja inferior con la galería de fotos del envío.
  void _showPhotos(Trip t) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: TripPhotosGallery(tripId: t.id),
        ),
      ),
    );
  }

  /// Confirmación antes de completar, con el monto que cobra (el mismo que
  /// se muestra en pantalla: ya descontado el cupón, si hay).
  Future<bool> _confirmComplete(Trip t) async {
    final charge = t.discountAmount != null
        ? (t.fareBeforeDiscount ?? t.estimatedFare) - t.discountAmount!
        : t.estimatedFare;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(t.isDelivery ? '¿Completar el envío?' : '¿Completar el viaje?'),
        content: Text('Cobra S/ ${charge.toStringAsFixed(2)}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: BugieColors.success),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Completar'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _complete() async {
    if (_trip == null || _busy) return;
    if (!await _confirmComplete(_trip!) || !mounted || _trip == null) return;
    // Envio: antes de completar hay que confirmar la entrega (foto + quien recibio).
    if (_trip!.isDelivery && _trip!.deliveryConfirmedAt == null) {
      final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => DriverDeliveryConfirmationScreen(
            tripId: _trip!.id,
            recipientName: _trip!.recipientName,
          ),
        ),
      );
      if (ok != true || !mounted) return;
    }
    _endHandled = true;
    setState(() {
      _busy = true;
      _error = null;
    });
    // Manda los puntos GPS que quedaron en cola con el tripId de este viaje,
    // así el recorrido queda completo antes de cerrarlo.
    await context.read<LocationTrackingService>().flush();
    if (!mounted) return;
    try {
      await context.read<TripsRepository>().complete(_trip!.id);
      if (!mounted) return;
      // Viaje completo: el conductor sigue ONLINE recibiendo solicitudes,
      // así que vuelve al envío de GPS sin viaje (cada 30s).
      startDriverIdleTracking(context);
      // Redirige SIEMPRE al dashboard del conductor y muestra mensaje verde
      // (que sobrevive a la navegación gracias al messenger global).
      final wasDelivery = _trip!.isDelivery;
      ActiveTripService().clear(); // sin franja: ya no hay viaje
      context.go('/driver');
      showSuccessSnack(
          wasDelivery ? 'Envío completado' : 'Viaje completado correctamente');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    if (_loading) {
      return Scaffold(
        backgroundColor: c.bg,
        appBar: const BugieInternalHeader(title: 'Viaje en curso'),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_trip == null) {
      return Scaffold(
        backgroundColor: c.bg,
        appBar: const BugieInternalHeader(title: 'Viaje en curso'),
        body: SafeArea(
          child: Center(
            child: Text('No tienes viaje activo',
                style: TextStyle(color: c.textMuted)),
          ),
        ),
      );
    }

    final t = _trip!;

    final origin = LatLng(t.originLat, t.originLng);
    final dest = LatLng(t.destLat, t.destLng);
    final canStart = t.status == TripStatus.accepted;
    final canComplete = t.status == TripStatus.inProgress;

    // El destino del conductor depende del estado del viaje:
    // - accepted (2): debe ir a recoger al pasajero → destino = origen del viaje
    // - inProgress (3): llevarlo al destino → destino = destino del viaje
    final targetForDriver = canComplete ? dest : origin;
    final targetLabel = canComplete ? 'Al destino' : 'A la recogida';

    // Distancia y tiempo restante usando la posición ACTUAL del conductor
    // (no la del origen del viaje). Usamos la fórmula Haversine local.
    // El tiempo usa ~22 km/h urbano (lo mismo que el backend de fallback).
    double? remainingKm;
    int? remainingMin;
    if (_myPosition != null) {
      final km = _haversineKm(_myPosition!, targetForDriver);
      remainingKm = km;
      // 22 km/h => km / 22 * 60 minutos
      remainingMin = (km / 22.0 * 60.0).round();
    }

    final markers = <BugieMarker>[
      BugieMarker(position: origin, kind: MarkerKind.origin),
      BugieMarker(position: dest, kind: MarkerKind.destination),
      // Pin del propio conductor (auto). Solo si tenemos posición GPS.
      if (_myPosition != null)
        BugieMarker(position: _myPosition!, kind: MarkerKind.driver),
    ];

    List<LatLng> routePoints = [];
    if (_routeInfo != null && _routeInfo!.options.isNotEmpty) {
      routePoints = _routeInfo!.options.first.coordinates;
    }

    return Scaffold(
      backgroundColor: c.bg,
      appBar: BugieInternalHeader(
          title: t.isDelivery ? 'Envío en curso' : 'Viaje en curso'),
      // En pantallas bajas (celular en horizontal, pantalla dividida) todo
      // pasa a una columna con scroll y el mapa toma un alto fijo, para que
      // nada se desborde.
      body: SafeArea(
        child: LayoutBuilder(builder: (context, constraints) {
          final compact = constraints.maxHeight < 620;
          Widget mapSlot(Widget map) => compact
              ? SizedBox(height: 260, child: map)
              : Expanded(child: map);
          final content = Column(
            mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
            children: [
              // Banner de estado + KPIs grandes (distancia / tiempo al
              // siguiente punto). Solo se muestran cuando tenemos GPS y ruta.
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                color: BugieColors.primary.withValues(alpha: 0.06),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                              t.isDelivery && t.status == TripStatus.inProgress
                                  ? 'Envío en curso'
                                  : TripStatus.labelForDriver(t.status),
                              style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                  color: c.text)),
                        ),
                        ServiceBadge(isDelivery: t.isDelivery, compact: true),
                      ],
                    ),
                    if (remainingKm != null && remainingMin != null) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: _DriverKpiCard(
                              icon: Icons.straighten,
                              label: targetLabel,
                              value: '${remainingKm.toStringAsFixed(1)} km',
                              color: BugieColors.primary,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _DriverKpiCard(
                              icon: Icons.schedule,
                              label: 'Llegas en',
                              value: '$remainingMin min',
                              color: BugieColors.success,
                            ),
                          ),
                        ],
                      ),
                    ] else if (_myPosition == null) ...[
                      const SizedBox(height: 4),
                      const Text(
                        'Esperando ubicación GPS...',
                        style: TextStyle(
                            fontSize: 12, color: BugieColors.textMuted),
                      ),
                    ],
                  ],
                ),
              ),
              // Mapa
              mapSlot(
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  child: BugieMap(
                    height: double.infinity,
                    markers: markers,
                    route: routePoints,
                    center: origin,
                    fitBoundsOnMarkers: true,
                    // Margen derecho extra: que los botones del mapa no tapen
                    // tu auto ni los pines.
                    fitPadding: const EdgeInsets.fromLTRB(40, 40, 72, 40),
                  ),
                ),
              ),
              // Panel inferior con acciones
              Container(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(20)),
                  border: Border(top: BorderSide(color: c.border)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.08),
                      blurRadius: 12,
                      offset: const Offset(0, -3),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _StopLine(
                      color: BugieColors.mapOrigin,
                      text: t.originAddress,
                      strong: canStart,
                    ),
                    const SizedBox(height: 6),
                    _StopLine(
                      color: BugieColors.mapDestination,
                      text: t.destAddress,
                      strong: canComplete,
                    ),
                    const SizedBox(height: 10),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // Si el pasajero aplico un cupon, el conductor cobra el
                        // monto YA DESCONTADO. Sin el desglose veria un numero
                        // menor al acordado y no sabria por que: ahi es donde
                        // empiezan los reclamos.
                        if (t.discountAmount != null) ...[
                          Text(
                            'Cobras: S/ '
                            '${((t.fareBeforeDiscount ?? t.estimatedFare) - t.discountAmount!).toStringAsFixed(2)}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Tarifa S/ ${(t.fareBeforeDiscount ?? t.estimatedFare).toStringAsFixed(2)} · '
                            'cupón del pasajero −S/ ${t.discountAmount!.toStringAsFixed(2)}',
                            style: const TextStyle(
                                fontSize: 12, color: BugieColors.textMuted),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'El descuento lo pone Bugie, no sale de tu ganancia.',
                            style: TextStyle(
                                fontSize: 11.5, color: BugieColors.textMuted),
                          ),
                        ] else
                          Text('S/ ${t.estimatedFare.toStringAsFixed(2)}',
                              style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w800,
                                  color: c.text)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: (_routeInfo != null &&
                                  _routeInfo!.options.isNotEmpty)
                              ? Text(
                                  '${_routeInfo!.options.first.distanceKm.toStringAsFixed(1)} km · ${_routeInfo!.options.first.durationMinutes.round()} min',
                                  maxLines: 1,
                                  textAlign: TextAlign.right,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 12.5, color: c.textMuted),
                                )
                              : const SizedBox.shrink(),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: c.surface2,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: c.border),
                          ),
                          child: Text(_payLabel(t.paymentMethod),
                              style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: c.text)),
                        ),
                      ],
                    ),
                    // Envio: que lleva y a quien se entrega
                    if (t.isDelivery) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: BugieColors.primary.withOpacity(0.4)),
                        ),
                        // Paquete (descripción, peso, frágil, detalles), a quién
                        // se entrega y estado. Con tope de alto + scroll para no
                        // tapar el mapa; las fotos se ven aparte.
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxHeight: 170),
                              child: SingleChildScrollView(
                                child:
                                    DeliveryInfo(trip: t, showGallery: false),
                              ),
                            ),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed: () => _showPhotos(t),
                                icon: const Icon(Icons.photo_library_outlined,
                                    size: 18),
                                label: const Text('Ver fotos del envío'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(_error!,
                          style: const TextStyle(color: BugieColors.danger)),
                    ],
                    const SizedBox(height: 14),
                    // Avisar al pasajero que ya está en el punto de recojo
                    if (canStart) ...[
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 48),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        icon: Icon(t.driverArrivedAt == null
                            ? Icons.place
                            : Icons.notifications_active),
                        label: Text(t.driverArrivedAt == null
                            ? 'Ya llegué'
                            : 'Avisar de nuevo al pasajero'),
                        onPressed: _busy ? null : _arrived,
                      ),
                      if (t.driverArrivedAt != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            'Pasajero avisado a las ${_hhmm(t.driverArrivedAt!)}',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 12, color: BugieColors.success),
                          ),
                        ),
                      const SizedBox(height: 10),
                    ],
                    if (canStart)
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          minimumSize: const Size(0, 56),
                          textStyle: const TextStyle(
                              fontSize: 17, fontWeight: FontWeight.w800),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        icon: const Icon(Icons.play_arrow),
                        label: Text(
                            t.isDelivery ? 'Paquete a bordo' : 'Iniciar viaje'),
                        onPressed: _busy ? null : _start,
                      )
                    else if (canComplete)
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BugieColors.success,
                          minimumSize: const Size(0, 56),
                          textStyle: const TextStyle(
                              fontSize: 17, fontWeight: FontWeight.w800),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        icon: const Icon(Icons.check),
                        label: Text(t.isDelivery
                            ? 'Completar envío'
                            : 'Completar viaje'),
                        onPressed: _busy ? null : _complete,
                      )
                    else
                      // Fallback de diagnóstico: si no se cumple ni canStart ni
                      // canComplete, mostramos el status real para que sea visible
                      // sin tener que abrir los logs.
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: BugieColors.warning.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: BugieColors.warning),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.info_outline,
                                color: BugieColors.warning, size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Estado actual: ${TripStatus.labelForDriver(t.status)} '
                                '(código ${t.status}).',
                                style: const TextStyle(fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 8),
                    // Fila secundaria: Cancelar (solo antes de iniciar) y SOS.
                    // Mismo alto que el botón principal; si no hay Cancelar,
                    // SOS ocupa todo el ancho para que no quede un botón suelto.
                    Row(
                      children: [
                        if (canStart) ...[
                          Expanded(
                            child: OutlinedButton.icon(
                              style: OutlinedButton.styleFrom(
                                foregroundColor: BugieColors.danger,
                                minimumSize: const Size.fromHeight(52),
                                side: BorderSide(
                                    color: BugieColors.danger
                                        .withValues(alpha: 0.5)),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14)),
                              ),
                              icon: const Icon(Icons.cancel_outlined, size: 20),
                              label: const Text('Cancelar viaje',
                                  maxLines: 1, overflow: TextOverflow.ellipsis),
                              onPressed: _busy ? null : _cancelByDriver,
                            ),
                          ),
                          const SizedBox(width: 12),
                        ],
                        Expanded(
                          child: FilledButton.icon(
                            style: FilledButton.styleFrom(
                              backgroundColor:
                                  BugieColors.danger.withValues(alpha: 0.12),
                              foregroundColor: BugieColors.danger,
                              minimumSize: const Size.fromHeight(52),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  side: const BorderSide(
                                      color: BugieColors.danger, width: 1.4)),
                            ),
                            icon: const Icon(Icons.shield, size: 20),
                            label: Text(canStart ? 'SOS' : 'SOS · Emergencia',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                            onPressed: () => context.push('/driver/sos'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          );
          return compact ? SingleChildScrollView(child: content) : content;
        }),
      ),
    );
  }
}

/// Calcula la distancia en kilómetros entre dos puntos usando Haversine.
/// La aproximación NO sigue las calles, da distancia en línea recta.
/// Multiplicamos por 1.3 para acercarla a la distancia real urbana.
double _haversineKm(LatLng a, LatLng b) {
  const earthRadiusKm = 6371.0;
  final dLat = _deg2rad(b.latitude - a.latitude);
  final dLng = _deg2rad(b.longitude - a.longitude);
  final lat1 = _deg2rad(a.latitude);
  final lat2 = _deg2rad(b.latitude);
  final h = (sin(dLat / 2) * sin(dLat / 2)) +
      cos(lat1) * cos(lat2) * (sin(dLng / 2) * sin(dLng / 2));
  final c = 2 * atan2(sqrt(h), sqrt(1 - h));
  return earthRadiusKm * c * 1.3; // factor urbano
}

double _deg2rad(double deg) => deg * (pi / 180.0);

String _payLabel(String m) {
  switch (m) {
    case 'cash':
      return 'Efectivo';
    case 'yape':
      return 'Yape';
    case 'plin':
      return 'Plin';
    default:
      return m.toUpperCase();
  }
}

/// Una parada (origen o destino) en una línea con su punto de color.
/// La parada a la que vas ahora se muestra resaltada.
class _StopLine extends StatelessWidget {
  final Color color;
  final String text;
  final bool strong;
  const _StopLine(
      {required this.color, required this.text, required this.strong});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: strong ? 15 : 13.5,
              fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
              color: strong ? c.text : c.textMuted,
            ),
          ),
        ),
      ],
    );
  }
}

/// Card de KPI para mostrar al conductor cuánto le falta.
/// Diseño compacto pero legible mientras maneja.
class _DriverKpiCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _DriverKpiCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    style: TextStyle(fontSize: 12, color: c.textMuted),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
                Text(value,
                    style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: color)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
