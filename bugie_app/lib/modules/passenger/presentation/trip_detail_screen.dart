import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/bugie_theme.dart';
import '../../../core/api/api_config.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../../core/widgets/from_badge.dart';
import '../../../core/widgets/service_badge.dart';
import '../../../core/widgets/schedule_picker.dart';
import '../../../core/widgets/trip_photos_gallery.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/route_model.dart';
import '../../trips/domain/trip_model.dart';

/// Detalle de un viaje o envío **terminado** (completado o cancelado).
/// Es de SOLO LECTURA: muestra origen, destino y el mapa marcado, todo
/// deshabilitado. Si es un envío, agrega la data del paquete, el
/// destinatario, el recojo, la entrega y la galería de fotos.
///
/// Lo usan el pasajero y el conductor. Con [viewerIsDriver] = true no se
/// muestra la card del conductor (sería él mismo) sino el nombre del pasajero.
///
/// En el mapa se compara la RUTA DEL SISTEMA (azul punteada) con el
/// RECORRIDO REAL del conductor (verde continua). Ambas se piden en paralelo
/// al abrir la pantalla y no bloquean el resto del detalle.
class TripDetailScreen extends StatefulWidget {
  final Trip trip;
  final bool viewerIsDriver;
  const TripDetailScreen({
    super.key,
    required this.trip,
    this.viewerIsDriver = false,
  });

  @override
  State<TripDetailScreen> createState() => _TripDetailScreenState();
}

/// Estado de carga de una de las dos líneas del mapa.
enum _LineState { loading, ready, empty, error }

class _TripDetailScreenState extends State<TripDetailScreen> {
  PlannedRoute? _planned;
  _LineState _plannedState = _LineState.loading;
  RealPath? _real;
  _LineState _realState = _LineState.loading;

  Trip get trip => widget.trip;
  bool get viewerIsDriver => widget.viewerIsDriver;

  @override
  void initState() {
    super.initState();
    final repo = context.read<TripsRepository>();
    // En paralelo: cada una actualiza su parte cuando llega.
    _loadPlanned(repo);
    _loadReal(repo);
  }

  Future<void> _loadPlanned(TripsRepository repo) async {
    try {
      final r = await repo.getPlannedRoute(trip.id);
      if (!mounted) return;
      final hasTrip = (r.trip?.points.length ?? 0) >= 2;
      setState(() {
        _planned = r;
        _plannedState = hasTrip ? _LineState.ready : _LineState.empty;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _plannedState = _LineState.error);
    }
  }

  Future<void> _loadReal(TripsRepository repo) async {
    try {
      final r = await repo.getRealPath(trip.id);
      if (!mounted) return;
      setState(() {
        _real = r;
        _realState =
            r.points.length >= 2 ? _LineState.ready : _LineState.empty;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _realState = _LineState.error);
    }
  }

  /// Tramo conductor -> recogida: solo lo ve el conductor y solo si existe.
  PlannedRouteLeg? get _pickupLeg {
    final p = _planned?.pickup;
    if (!viewerIsDriver || p == null || p.points.length < 2) return null;
    return p;
  }

  /// Líneas del mapa: primero el recorrido real (verde, gruesa, debajo) y
  /// encima la ruta del sistema punteada, para que ambas se vean aunque
  /// coincidan. El tramo de recogida va más tenue.
  List<BugieMapLine> _mapLines() {
    final lines = <BugieMapLine>[];
    final real = _real;
    if (_realState == _LineState.ready && real != null) {
      lines.add(BugieMapLine(
        points: real.points,
        color: BugieColors.mapRealPath,
        width: 6,
      ));
    }
    final pickup = _pickupLeg;
    if (pickup != null) {
      lines.add(BugieMapLine(
        points: pickup.points,
        color: BugieColors.mapPlannedRoute.withValues(alpha: 0.45),
        width: 3,
        dashed: true,
      ));
    }
    final planned = _planned?.trip;
    if (_plannedState == _LineState.ready && planned != null) {
      lines.add(BugieMapLine(
        points: planned.points,
        color: BugieColors.mapPlannedRoute,
        width: 4,
        dashed: true,
      ));
    }
    return lines;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final isDelivery = trip.isDelivery;
    final title = isDelivery ? 'Detalle del envío' : 'Detalle del viaje';

    final origin = LatLng(trip.originLat, trip.originLng);
    final dest = LatLng(trip.destLat, trip.destLng);

    final markers = <BugieMarker>[
      BugieMarker(position: origin, kind: MarkerKind.origin),
      ...trip.waypoints.asMap().entries.map(
            (e) => BugieMarker(
              position: LatLng(e.value.lat, e.value.lng),
              kind: MarkerKind.waypoint,
              waypointIndex: e.key,
            ),
          ),
      BugieMarker(position: dest, kind: MarkerKind.destination),
    ];

    final fare = trip.finalFare ?? trip.estimatedFare;

    // Mapa más grande: ~46% de la altura de pantalla (acotado).
    final mapHeight =
        (MediaQuery.of(context).size.height * 0.46).clamp(320.0, 480.0);

    final hasDriver = (trip.driverName ?? '').trim().isNotEmpty ||
        (trip.vehiclePlate ?? '').trim().isNotEmpty ||
        (trip.vehiclePhotoUrl ?? '').trim().isNotEmpty;

    return Scaffold(
      backgroundColor: c.bg,
      appBar: BugieInternalHeader(title: title),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            // Mapa marcado, ESTÁTICO (IgnorePointer = solo para ver).
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                height: mapHeight,
                child: IgnorePointer(
                  child: BugieMap(
                    center: origin,
                    zoom: 14,
                    height: mapHeight,
                    markers: markers,
                    lines: _mapLines(),
                    fitBoundsOnMarkers: true,
                    fitOnReady: true,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            _RouteLegend(
              plannedState: _plannedState,
              plannedKm: _planned?.trip?.distanceKm,
              showPickup: _pickupLeg != null,
              pickupKm: _pickupLeg?.distanceKm,
              realState: _realState,
              realKm: _real?.distanceKm,
            ),
            const SizedBox(height: 16),

            // Card del conductor (foto, vehículo, foto del auto e info).
            if (hasDriver && !viewerIsDriver) ...[
              _DriverCard(trip: trip),
              const SizedBox(height: 16),
            ],

            // Estado + fecha
            Row(
              children: [
                _StatusChip(status: trip.status),
                const SizedBox(width: 8),
                ServiceBadge(isDelivery: isDelivery),
                const Spacer(),
                Text(_fmtDate(trip.createdAt),
                    style: BugieText.body.copyWith(color: c.textMuted)),
              ],
            ),
            // Programado: para cuándo era.
            if (trip.scheduledAt != null) ...[
              const SizedBox(height: 10),
              ScheduledBadge(at: trip.scheduledAt!, forLabel: true),
            ],
            const SizedBox(height: 16),

            // Cancelado: quién canceló y por qué.
            if (trip.status == TripStatus.cancelled) ...[
              _CancelInfo(trip: trip),
              const SizedBox(height: 16),
            ],

            // Conductor viendo su viaje: a quién llevó / de quién era el envío.
            if (viewerIsDriver &&
                (trip.passengerName ?? '').trim().isNotEmpty) ...[
              _ReadOnlyField(
                icon: Icons.person,
                iconColor: BugieColors.primary,
                label: isDelivery ? 'Cliente' : 'Pasajero',
                value: trip.passengerName!,
              ),
              const SizedBox(height: 10),
            ],

            // Origen / Destino (solo lectura)
            _ReadOnlyField(
              icon: Icons.trip_origin,
              iconColor: BugieColors.mapOrigin,
              label: 'Origen',
              value: trip.originAddress,
            ),
            const SizedBox(height: 10),
            _ReadOnlyField(
              icon: Icons.place,
              iconColor: BugieColors.mapDestination,
              label: 'Destino',
              value: trip.destAddress,
            ),
            const SizedBox(height: 18),

            // Tarifa + método de pago (card destacada)
            _FareCard(fare: fare, paymentMethod: trip.paymentMethod),

            // Data extra del envío
            if (isDelivery) ...[
              const SizedBox(height: 18),
              Text('Datos del paquete',
                  style: BugieText.h3.copyWith(color: c.text)),
              const SizedBox(height: 8),
              if ((trip.packageDescription ?? '').isNotEmpty)
                _InfoRow(
                    label: 'Descripción', value: trip.packageDescription!),
              if (trip.packageWeightKg != null)
                _InfoRow(
                    label: 'Peso',
                    value: '${trip.packageWeightKg!.toStringAsFixed(1)} kg'),
              _InfoRow(
                  label: 'Frágil', value: trip.packageIsFragile ? 'Sí' : 'No'),
              if ((trip.packageDetails ?? '').isNotEmpty)
                _InfoRow(label: 'Detalles', value: trip.packageDetails!),

              // Destinatario
              if ((trip.recipientName ?? '').isNotEmpty)
                _InfoRow(label: 'Destinatario', value: trip.recipientName!),
              if ((trip.recipientPhone ?? '').isNotEmpty)
                _InfoRow(
                    label: 'Teléfono destinatario',
                    value: trip.recipientPhone!),

              // Recojo y entrega
              _InfoRow(
                  label: 'Recojo',
                  value: trip.pickupVerified
                      ? 'Paquete recogido y verificado'
                      : 'Sin verificar'),
              if ((trip.pickupObservation ?? '').trim().isNotEmpty)
                _InfoRow(
                    label: 'Observación del recojo',
                    value: trip.pickupObservation!),
              if ((trip.deliveryReceivedBy ?? '').isNotEmpty)
                _InfoRow(label: 'Recibió', value: trip.deliveryReceivedBy!),
              if (trip.deliveryConfirmedAt != null)
                _InfoRow(
                    label: 'Entregado el',
                    value: _fmtDate(trip.deliveryConfirmedAt!.toLocal())),

              const SizedBox(height: 14),
              TripPhotosGallery(tripId: trip.id),
            ],
          ],
        ),
      ),
    );
  }

  static String _fmtDate(DateTime d) {
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    final hh = d.hour.toString().padLeft(2, '0');
    final mi = d.minute.toString().padLeft(2, '0');
    return '$dd/$mm/${d.year} · $hh:$mi';
  }
}

String _fmtKm(double km) => '${km.toStringAsFixed(km < 10 ? 2 : 1)} km';

/// Leyenda debajo del mapa: "Ruta del sistema · X km" y
/// "Recorrido real · Y km", con su estado (cargando / sin datos / error).
class _RouteLegend extends StatelessWidget {
  final _LineState plannedState;
  final double? plannedKm;
  /// Tramo conductor -> recogida (solo para el conductor, si existe).
  final bool showPickup;
  final double? pickupKm;
  final _LineState realState;
  final double? realKm;

  const _RouteLegend({
    required this.plannedState,
    required this.plannedKm,
    required this.showPickup,
    required this.pickupKm,
    required this.realState,
    required this.realKm,
  });

  String _plannedText() {
    switch (plannedState) {
      case _LineState.loading:
        return 'Cargando…';
      case _LineState.empty:
        return 'Sin ruta guardada';
      case _LineState.error:
        return 'No se pudo cargar';
      case _LineState.ready:
        return plannedKm == null
            ? 'Ruta del sistema'
            : 'Ruta del sistema · ${_fmtKm(plannedKm!)}';
    }
  }

  String _realText() {
    switch (realState) {
      case _LineState.loading:
        return 'Cargando…';
      case _LineState.empty:
        return 'Sin recorrido registrado';
      case _LineState.error:
        return 'No se pudo cargar';
      case _LineState.ready:
        return 'Recorrido real · ${_fmtKm(realKm ?? 0)}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _LegendRow(
            color: BugieColors.mapPlannedRoute,
            dashed: true,
            title: 'Ruta del sistema',
            text: _plannedText(),
            state: plannedState,
          ),
          if (showPickup) ...[
            const SizedBox(height: 8),
            _LegendRow(
              color: BugieColors.mapPlannedRoute.withValues(alpha: 0.45),
              dashed: true,
              title: 'Tramo de recogida',
              text: pickupKm == null
                  ? 'Tramo de recogida'
                  : 'Tramo de recogida · ${_fmtKm(pickupKm!)}',
              state: _LineState.ready,
            ),
          ],
          const SizedBox(height: 8),
          _LegendRow(
            color: BugieColors.mapRealPath,
            dashed: false,
            title: 'Recorrido real',
            text: _realText(),
            state: realState,
          ),
        ],
      ),
    );
  }
}

/// Fila de la leyenda: muestra de la línea + texto. Si no está lista, el
/// estado va atenuado y precedido por el nombre de la línea.
class _LegendRow extends StatelessWidget {
  final Color color;
  final bool dashed;
  final String title;
  final String text;
  final _LineState state;

  const _LegendRow({
    required this.color,
    required this.dashed,
    required this.title,
    required this.text,
    required this.state,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final ready = state == _LineState.ready;
    return Row(
      children: [
        SizedBox(
          width: 28,
          height: 10,
          child: CustomPaint(
            painter: _LineSamplePainter(
              color: ready ? color : color.withValues(alpha: 0.35),
              dashed: dashed,
              width: dashed ? 3 : 5,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: ready
              ? Text(text,
                  style: TextStyle(
                      color: c.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w600))
              : Text.rich(
                  TextSpan(children: [
                    TextSpan(
                        text: '$title: ',
                        style: TextStyle(
                            color: c.text,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)),
                    TextSpan(
                        text: text,
                        style: TextStyle(color: c.textMuted, fontSize: 13)),
                  ]),
                ),
        ),
        if (state == _LineState.loading)
          SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: c.textMuted),
          ),
      ],
    );
  }
}

/// Dibuja una muestra corta de línea (continua o discontinua) para la leyenda.
class _LineSamplePainter extends CustomPainter {
  final Color color;
  final bool dashed;
  final double width;
  const _LineSamplePainter(
      {required this.color, required this.dashed, required this.width});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round;
    final y = size.height / 2;
    final start = width / 2;
    final end = size.width - width / 2;
    if (!dashed) {
      canvas.drawLine(Offset(start, y), Offset(end, y), paint);
      return;
    }
    const dash = 6.0, gap = 4.0;
    var x = start;
    while (x < end) {
      final to = (x + dash) > end ? end : x + dash;
      canvas.drawLine(Offset(x, y), Offset(to, y), paint);
      x += dash + gap;
    }
  }

  @override
  bool shouldRepaint(covariant _LineSamplePainter old) =>
      old.color != color || old.dashed != dashed || old.width != width;
}

/// Aviso de viaje/envío cancelado: quién lo canceló (Pasajero, Conductor o
/// Bugie) y el motivo, si lo hay.
class _CancelInfo extends StatelessWidget {
  final Trip trip;
  const _CancelInfo({required this.trip});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final by = trip.cancelledBy;
    final reason = (trip.cancelReason ?? '').trim();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BugieColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BugieColors.danger.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.cancel_outlined, color: BugieColors.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text('Cancelado por: ',
                        style: TextStyle(
                            color: c.text,
                            fontSize: 13,
                            fontWeight: FontWeight.w700)),
                    if (by == null)
                      Text('—', style: TextStyle(color: c.text, fontSize: 13))
                    else ...[
                      Icon(fromIcon(by), size: 15, color: c.text),
                      const SizedBox(width: 4),
                      Text(fromLabel(by),
                          style: TextStyle(
                              color: c.text,
                              fontSize: 13,
                              fontWeight: FontWeight.w600)),
                    ],
                  ],
                ),
                if (reason.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text('Motivo: $reason',
                      style: TextStyle(color: c.textMuted, fontSize: 13)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Chip de estado del viaje con color según el estado.
class _StatusChip extends StatelessWidget {
  final int status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final Color color = status == TripStatus.completed
        ? BugieColors.success
        : status == TripStatus.cancelled
            ? BugieColors.danger
            : BugieColors.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(
        TripStatus.labelForPassenger(status),
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// Campo de dirección solo lectura (ícono + etiqueta + valor).
class _ReadOnlyField extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;
  const _ReadOnlyField({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                        color: c.textMuted,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(value.isEmpty ? '—' : value,
                    style: TextStyle(color: c.text, fontSize: 14)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Fila etiqueta → valor.
class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label,
                style: TextStyle(color: c.textMuted, fontSize: 13)),
          ),
          Expanded(
            child: Text(value,
                style: TextStyle(
                    color: c.text, fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

/// Card del conductor del viaje: foto, nombre, ★rating, auto, placa y foto del
/// vehículo. Tocar la foto del conductor o del auto la muestra en grande.
/// Card destacada con la tarifa total y el método de pago.
class _FareCard extends StatelessWidget {
  final double fare;
  final String paymentMethod;
  const _FareCard({required this.fare, required this.paymentMethod});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            BugieColors.primary.withOpacity(0.10),
            BugieColors.primary.withOpacity(0.02),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: BugieColors.primary.withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Total',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: c.textMuted)),
                const SizedBox(height: 4),
                Text('S/ ${fare.toStringAsFixed(2)}',
                    style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                        color: BugieColors.primary)),
              ],
            ),
          ),
          Container(
            width: 1,
            height: 44,
            color: c.border,
            margin: const EdgeInsets.symmetric(horizontal: 16),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('Método de pago',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: c.textMuted)),
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(_payIcon(paymentMethod),
                      size: 18, color: c.text),
                  const SizedBox(width: 6),
                  Text(_payLabel(paymentMethod),
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: c.text)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  static IconData _payIcon(String method) {
    switch (method) {
      case 'cash':
        return Icons.payments_outlined;
      case 'yape':
      case 'plin':
        return Icons.smartphone;
      default:
        return Icons.account_balance_wallet_outlined;
    }
  }

  static String _payLabel(String method) {
    switch (method) {
      case 'cash':
        return 'Efectivo';
      case 'yape':
        return 'Yape';
      case 'plin':
        return 'Plin';
      default:
        return method;
    }
  }
}

class _DriverCard extends StatelessWidget {
  final Trip trip;
  const _DriverCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final t = trip;
    final initials = (t.driverName ?? '')
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((s) => s.isEmpty ? '' : s[0].toUpperCase())
        .join();
    final vehicle = [t.vehicleBrand, t.vehicleModel, t.vehicleColor]
        .where((s) => s != null && s.isNotEmpty)
        .join(' · ');
    final driverPhoto = ApiConfig.resolveMediaUrl(t.driverPhotoUrl);
    final vehiclePhoto = ApiConfig.resolveMediaUrl(t.vehiclePhotoUrl);
    final hasVehiclePhoto = vehiclePhoto != null && vehiclePhoto.isNotEmpty;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('CONDUCTOR',
              style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                  letterSpacing: 1,
                  color: c.textMuted)),
          const SizedBox(height: 12),
          Row(
            children: [
              GestureDetector(
                onTap: (driverPhoto != null && driverPhoto.isNotEmpty)
                    ? () => _showImagePreview(context, driverPhoto)
                    : null,
                child: _DriverAvatar(
                  photoUrl: t.driverPhotoUrl,
                  initials: initials,
                  accentColor: BugieColors.primary,
                  size: 54,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.driverName ?? 'Conductor',
                      style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          color: c.text),
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (t.driverRating != null) ...[
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          const Icon(Icons.star, size: 15, color: Colors.amber),
                          const SizedBox(width: 3),
                          Text(t.driverRating!.toStringAsFixed(1),
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: c.text)),
                        ],
                      ),
                    ],
                    if (vehicle.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      Text(vehicle,
                          style: TextStyle(fontSize: 13, color: c.textMuted),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ],
                    if (t.vehiclePlate != null &&
                        t.vehiclePlate!.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          color: c.bg2,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: c.border),
                        ),
                        child: Text(
                          t.vehiclePlate!,
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 2,
                              color: c.text),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              // Ícono de auto a la derecha: al tocarlo se ve la foto del auto.
              if (hasVehiclePhoto) ...[
                const SizedBox(width: 10),
                InkWell(
                  onTap: () => _showImagePreview(context, vehiclePhoto),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    width: 58,
                    height: 58,
                    decoration: BoxDecoration(
                      color: BugieColors.primary.withOpacity(0.10),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                          color: BugieColors.primary.withOpacity(0.30)),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(Icons.directions_car,
                            color: BugieColors.primary, size: 26),
                        SizedBox(height: 1),
                        Text('Ver auto',
                            style: TextStyle(
                                fontSize: 8.5,
                                fontWeight: FontWeight.w700,
                                color: BugieColors.primary)),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _DriverAvatar extends StatelessWidget {
  final String? photoUrl;
  final String initials;
  final Color accentColor;
  final double size;
  const _DriverAvatar({
    required this.photoUrl,
    required this.initials,
    required this.accentColor,
    this.size = 48,
  });

  @override
  Widget build(BuildContext context) {
    final initialsAvatar = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [accentColor.withOpacity(0.85), accentColor],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: 16,
        ),
      ),
    );

    final resolved = ApiConfig.resolveMediaUrl(photoUrl);
    if (resolved == null || resolved.isEmpty) return initialsAvatar;

    return ClipOval(
      child: Image.network(
        resolved,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => initialsAvatar,
        loadingBuilder: (ctx, child, progress) =>
            progress == null ? child : initialsAvatar,
      ),
    );
  }
}

/// Muestra una imagen a pantalla completa con zoom (tocar fuera o la X cierra).
void _showImagePreview(BuildContext context, String url) {
  showDialog(
    context: context,
    barrierColor: Colors.black87,
    builder: (ctx) => Stack(
      children: [
        GestureDetector(
          onTap: () => Navigator.pop(ctx),
          child: Center(
            child: InteractiveViewer(
              minScale: 0.8,
              maxScale: 4,
              child: Image.network(
                url,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Icon(Icons.broken_image,
                    color: Colors.white, size: 60),
              ),
            ),
          ),
        ),
        Positioned(
          top: 40,
          right: 16,
          child: IconButton(
            icon: const Icon(Icons.close, color: Colors.white, size: 28),
            onPressed: () => Navigator.pop(ctx),
          ),
        ),
      ],
    ),
  );
}
