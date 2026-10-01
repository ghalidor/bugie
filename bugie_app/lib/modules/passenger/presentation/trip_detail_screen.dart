import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/theme/bugie_theme.dart';
import '../../../core/api/api_config.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../trips/domain/trip_model.dart';

/// Detalle de un viaje o envío **terminado** (completado o cancelado).
/// Es de SOLO LECTURA: muestra origen, destino y el mapa marcado, todo
/// deshabilitado. Si es un envío, agrega la data del paquete.
class TripDetailScreen extends StatelessWidget {
  final Trip trip;
  const TripDetailScreen({super.key, required this.trip});

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
                    fitBoundsOnMarkers: true,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Card del conductor (foto, vehículo, foto del auto e info).
            if (hasDriver) ...[
              _DriverCard(trip: trip),
              const SizedBox(height: 16),
            ],

            // Estado + fecha
            Row(
              children: [
                _StatusChip(status: trip.status),
                const Spacer(),
                Text(_fmtDate(trip.createdAt),
                    style: BugieText.body.copyWith(color: c.textMuted)),
              ],
            ),
            const SizedBox(height: 16),

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
