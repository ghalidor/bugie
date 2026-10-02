import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'driver_pickup_verification_screen.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/ui/app_messenger.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../../core/widgets/bugie_map.dart';
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

  @override
  void initState() {
    super.initState();
    _load();
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
          _myPosition!.latitude  != next.latitude ||
          _myPosition!.longitude != next.longitude) {
        setState(() => _myPosition = next);
      }
    });
  }

  @override
  void dispose() {
    _myPositionTimer?.cancel();
    // Al salir de la pantalla del viaje (completado / cancelado), el conductor
    // sigue ONLINE pero deja de mandar GPS.
    // Política nueva: GPS solo durante un viaje activo. Cuando se acaba el
    // viaje, paramos el tracking completamente — el conductor sigue online
    // hasta que presione "Desconectarme", pero sin gastar batería ni cuota.
    final tracking = context.read<LocationTrackingService>();
    if (tracking.isRunning) {
      tracking.stop();
    }
    super.dispose();
  }

  /// Configura el LocationTrackingService para que sus updates incluyan
  /// el tripId actual (cuando hay) y use el modo indicado.
  /// Como el sender depende del tripId, lo re-inyectamos al cambiar.
  void _switchTrackingTo(TrackingMode mode, {required String? tripId}) {
    final tracking = context.read<LocationTrackingService>();
    final repo = context.read<DriverRepository>();
    _trackingTripId = tripId;

    if (!tracking.isRunning) {
      // Caso defensivo: si el conductor entró aquí sin pasar por go-online
      // (ej: reload de la app con sesión guardada), iniciamos nosotros.
      tracking.start(
        mode: mode,
        sender: (pos) => repo.updateLocation(
          lat: pos.latitude,
          lng: pos.longitude,
          tripId: _trackingTripId,
          speedKmh: pos.speed * 3.6,
          heading: pos.heading,
        ),
      );
    } else {
      // Reagenda el sender para que incluya el tripId actual.
      tracking.start(
        mode: mode,
        sender: (pos) => repo.updateLocation(
          lat: pos.latitude,
          lng: pos.longitude,
          tripId: _trackingTripId,
          speedKmh: pos.speed * 3.6,
          heading: pos.heading,
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
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
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
          builder: (_) =>
              DriverPickupVerificationScreen(tripId: _trip!.id),
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

  Future<void> _complete() async {
    if (_trip == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<TripsRepository>().complete(_trip!.id);
      if (!mounted) return;
      // Viaje completo: PARAR el tracking. El conductor sigue ONLINE recibiendo
      // solicitudes, pero deja de mandar GPS hasta que acepte otro viaje.
      final tracking = context.read<LocationTrackingService>();
      if (tracking.isRunning) tracking.stop();
      // Redirige SIEMPRE al dashboard del conductor y muestra mensaje verde
      // (que sobrevive a la navegación gracias al messenger global).
      context.go('/driver');
      showSuccessSnack('Viaje completado correctamente');
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
    // DEBUG: imprimir status real para diagnosticar por qué no aparece el botón.
    // Si ves SOLO el botón SOS y no "Iniciar viaje" ni "Completar viaje",
    // el status del viaje no es 2 (accepted) ni 3 (inProgress).
    debugPrint('[trip_in_progress] trip.status=${t.status} '
        '(esperado: ${TripStatus.accepted}=accepted o ${TripStatus.inProgress}=inProgress)');

    final origin = LatLng(t.originLat, t.originLng);
    final dest = LatLng(t.destLat, t.destLng);
    final canStart = t.status == TripStatus.accepted;
    final canComplete = t.status == TripStatus.inProgress;

    // El destino del conductor depende del estado del viaje:
    // - accepted (2): debe ir a recoger al pasajero → destino = origen del viaje
    // - inProgress (3): llevarlo al destino → destino = destino del viaje
    final targetForDriver = canComplete ? dest : origin;
    final targetLabel = canComplete ? 'destino' : 'recogida';

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
      BugieMarker(position: dest,   kind: MarkerKind.destination),
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
      appBar: const BugieInternalHeader(title: 'Viaje en curso'),
      body: SafeArea(
        child: Column(
          children: [
            // Banner de estado + KPIs grandes (distancia / tiempo al
            // siguiente punto). Solo se muestran cuando tenemos GPS y ruta.
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              color: BugieColors.primary.withOpacity(0.06),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(TripStatus.labelForDriver(t.status),
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.bold)),
                  if (remainingKm != null && remainingMin != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: _DriverKpiCard(
                            icon: Icons.straighten,
                            label: 'Distancia al $targetLabel',
                            value: '${remainingKm.toStringAsFixed(1)} km',
                            color: BugieColors.primary,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _DriverKpiCard(
                            icon: Icons.schedule,
                            label: 'Tiempo estimado',
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
                      style: TextStyle(fontSize: 12, color: BugieColors.textMuted),
                    ),
                  ],
                ],
              ),
            ),
            // Mapa
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: BugieMap(
                  height: double.infinity,
                  markers: markers,
                  route: routePoints,
                  center: origin,
                  fitBoundsOnMarkers: true,
                ),
              ),
            ),
            // Panel inferior con acciones
            Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
              decoration: BoxDecoration(
                color: c.surface,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 8,
                    offset: const Offset(0, -2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('${t.originAddress} → ${t.destAddress}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Row(
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
                          style: const TextStyle(fontSize: 12, color: BugieColors.textMuted),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'El descuento lo pone Bugie, no sale de tu ganancia.',
                          style: TextStyle(fontSize: 11.5, color: BugieColors.textMuted),
                        ),
                      ] else
                        Text('Tarifa: S/ ${t.estimatedFare.toStringAsFixed(2)}'),
                      const Spacer(),
                      if (_routeInfo != null && _routeInfo!.options.isNotEmpty)
                        Text(
                          '${_routeInfo!.options.first.distanceKm.toStringAsFixed(1)} km · ${_routeInfo!.options.first.durationMinutes.round()} min',
                          style: const TextStyle(
                              fontSize: 12, color: BugieColors.textMuted),
                        ),
                      const SizedBox(width: 8),
                      Chip(
                        label: Text(t.paymentMethod.toUpperCase(),
                            style: const TextStyle(fontSize: 11)),
                        padding: EdgeInsets.zero,
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(_error!,
                        style: const TextStyle(color: BugieColors.danger)),
                  ],
                  const SizedBox(height: 12),
                  if (canStart)
                    ElevatedButton.icon(
                      icon: const Icon(Icons.play_arrow),
                      label: Text(t.isDelivery ? 'Paquete a bordo' : 'Iniciar viaje'),
                      onPressed: _busy ? null : _start,
                    )
                  else if (canComplete)
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                          backgroundColor: BugieColors.success),
                      icon: const Icon(Icons.check),
                      label: const Text('Completar viaje'),
                      onPressed: _busy ? null : _complete,
                    )
                  else
                    // Fallback de diagnóstico: si no se cumple ni canStart ni
                    // canComplete, mostramos el status real para que sea visible
                    // sin tener que abrir los logs.
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: BugieColors.warning.withOpacity(0.1),
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
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: BugieColors.danger,
                      side: const BorderSide(color: BugieColors.danger),
                    ),
                    icon: const Icon(Icons.shield),
                    label: const Text('SOS'),
                    onPressed: () => context.push('/driver/sos'),
                  ),
                ],
              ),
            ),
          ],
        ),
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

/// Card de KPI para mostrar al conductor cuánto le falta.
/// Diseño compacto pero legible mientras maneja.
class _DriverKpiCard extends StatelessWidget {
  final IconData icon;
  final String   label;
  final String   value;
  final Color    color;

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
            width: 36, height: 36,
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
                    style: TextStyle(
                        fontSize: 11, color: c.textMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                Text(value,
                    style: TextStyle(
                        fontSize: 17,
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
