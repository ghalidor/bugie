import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import '../../../../core/theme/bugie_theme.dart';
import '../../../trips/domain/trip_model.dart';
import '../../../trips/domain/proposal_model.dart';

/// Card compacto para la lista de solicitudes entrantes.
///
/// NO renderiza mapa — solo origen → destino con timeline visual, tarifa,
/// estado de negociación (badge), distancia al conductor y tiempo. Al
/// tocar, el callback `onTap` lleva al detalle (donde sí hay mapa
/// fullscreen).
///
/// Se usa en `IncomingRequestsScreen` reemplazando la card vieja gigante.
class TripRequestCardCompact extends StatelessWidget {
  final Trip trip;
  final DriverCounterInfo? counter;
  /// Distancia del conductor al origen, en KILÓMETROS. Si es null no se
  /// muestra la pill "a X km".
  final double? distanceToOriginKm;
  /// Si la lista detectó esta solicitud como "nueva" (apareció en el
  /// último poll y antes no estaba), le ponemos un punto pulsante.
  final bool isNew;
  final VoidCallback onTap;

  const TripRequestCardCompact({
    super.key,
    required this.trip,
    required this.counter,
    required this.onTap,
    this.distanceToOriginKm,
    this.isNew = false,
  });

  static String _timeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inSeconds < 60) return 'hace ${diff.inSeconds}s';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    return 'hace ${diff.inHours} h';
  }

  @override
  Widget build(BuildContext context) {
    // ── Badge derecho según estado de negociación ──────────────────
    Widget rightBadge;
    Color borderTint = Colors.transparent;
    if (counter?.isMyPending == true) {
      rightBadge = const _Pill(
        icon: Icons.hourglass_top,
        text: 'Esperando respuesta',
        color: Color(0xFFF59E0B),
      );
      borderTint = const Color(0xFFF59E0B).withOpacity(0.5);
    } else if (counter?.isCounterFromPassenger == true) {
      rightBadge = const _Pill(
        icon: Icons.swap_horiz,
        text: 'Pasajero responde',
        color: BugieColors.primary,
      );
      borderTint = BugieColors.primary.withOpacity(0.5);
    } else if (counter?.isWaitingMyConfirmation == true) {
      rightBadge = const _Pill(
        icon: Icons.check_circle,
        text: 'Confirmar viaje',
        color: Color(0xFF22C55E),
      );
      borderTint = const Color(0xFF22C55E);
    } else if (distanceToOriginKm != null) {
      final dStr = distanceToOriginKm! < 1
          ? '${(distanceToOriginKm! * 1000).toStringAsFixed(0)} m'
          : '${distanceToOriginKm!.toStringAsFixed(1)} km';
      rightBadge = _Pill(
        icon: Icons.location_on,
        text: 'a $dStr',
        color: BugieColors.primary,
      );
    } else {
      rightBadge = const SizedBox.shrink();
    }

    // Tarifa: si hay negociación usa counter.fare, sino estimada/solicitada.
    final fare = counter?.fare ?? trip.proposedFare ?? trip.estimatedFare;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1A1F2B),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: borderTint == Colors.transparent
                  ? Colors.white.withOpacity(0.08)
                  : borderTint,
              width: borderTint == Colors.transparent ? 0.5 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header: tiempo + badge derecho
              Row(
                children: [
                  if (isNew) ...[
                    Container(
                      width: 8, height: 8,
                      decoration: const BoxDecoration(
                        color: BugieColors.primary,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                  ],
                  Icon(Icons.access_time,
                      size: 12,
                      color: Colors.white.withOpacity(0.5)),
                  const SizedBox(width: 4),
                  Text(
                    _timeAgo(trip.createdAt),
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.white.withOpacity(0.5),
                    ),
                  ),
                  if (trip.isDelivery) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: BugieColors.accent.withOpacity(0.20),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text('Envio',
                          style: TextStyle(color: BugieColors.accent, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ],
                  const Spacer(),
                  rightBadge,
                ],
              ),
              const SizedBox(height: 10),

              // Origen → Destino con timeline visual
              _OriginDestTimeline(
                origin: trip.originAddress,
                destination: trip.destAddress,
              ),

              const SizedBox(height: 10),

              // Footer: tarifa + botón Ver
              Container(
                padding: const EdgeInsets.only(top: 10),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Colors.white.withOpacity(0.08)),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'S/ ${fare.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            counter?.isMyPending == true
                                ? 'Tu propuesta'
                                : counter?.isCounterFromPassenger == true
                                    ? 'Propuesta del pasajero'
                                    : _payLabel(trip.paymentMethod),
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.white.withOpacity(0.5),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: BugieColors.primary,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: const [
                          Text('Ver',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              )),
                          SizedBox(width: 4),
                          Icon(Icons.chevron_right,
                              size: 16, color: Colors.white),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _payLabel(String m) {
    switch (m) {
      case 'cash': return 'Efectivo';
      case 'yape': return 'Yape';
      case 'plin': return 'Plin';
      default:     return m.toUpperCase();
    }
  }
}

/// Distancia haversine en kilómetros entre dos puntos lat/lng.
/// Sirve para calcular "conductor → origen del viaje" sin depender de un
/// servicio externo. Aproximación esférica suficiente para distancias
/// urbanas (<50 km).
double haversineKm(LatLng a, LatLng b) {
  const earthKm = 6371.0;
  final dLat = _toRad(b.latitude - a.latitude);
  final dLng = _toRad(b.longitude - a.longitude);
  final lat1 = _toRad(a.latitude);
  final lat2 = _toRad(b.latitude);
  final h = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.sin(dLng / 2) * math.sin(dLng / 2) *
          math.cos(lat1) * math.cos(lat2);
  final c = 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
  return earthKm * c;
}

double _toRad(double deg) => deg * math.pi / 180.0;

/// Píldora reutilizable arriba a la derecha.
class _Pill extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;
  const _Pill({required this.icon, required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 4),
          Text(text,
              style: TextStyle(
                fontSize: 11,
                color: color,
                fontWeight: FontWeight.w500,
              )),
        ],
      ),
    );
  }
}

/// Timeline visual de origen → destino con bolita violeta arriba y magenta
/// abajo unidas por una línea vertical.
class _OriginDestTimeline extends StatelessWidget {
  final String origin;
  final String destination;
  const _OriginDestTimeline({required this.origin, required this.destination});

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 4),
              Container(
                width: 9, height: 9,
                decoration: const BoxDecoration(
                  color: BugieColors.primary,
                  shape: BoxShape.circle,
                ),
              ),
              Expanded(
                child: Container(
                  width: 2,
                  margin: const EdgeInsets.symmetric(vertical: 3),
                  color: Colors.white.withOpacity(0.15),
                ),
              ),
              Container(
                width: 9, height: 9,
                decoration: const BoxDecoration(
                  color: BugieColors.accent,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(height: 4),
            ],
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  origin,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  destination,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}