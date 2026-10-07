import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import '../../../../core/theme/bugie_theme.dart';
import '../../../../core/widgets/negotiation/negotiation.dart';
import '../../../../core/widgets/service_badge.dart';
import '../../../../core/widgets/schedule_picker.dart';
import '../../../trips/domain/trip_model.dart';
import '../../../trips/domain/proposal_model.dart';

/// Card compacto para la lista de solicitudes entrantes.
///
/// NO renderiza mapa. Muestra: PRECIO grande, chips (distancia al pasajero
/// y "a X min", forma de pago, envío/fotos, paradas), origen → destino y
/// el botón "Ver". Tocar la tarjeta o "Ver" lleva al detalle (con mapa
/// fullscreen), donde están las acciones (aceptar, proponer, rechazar).
class TripRequestCardCompact extends StatelessWidget {
  final Trip trip;
  final DriverCounterInfo? counter;
  /// Distancia del conductor al origen, en KILÓMETROS. Si es null no se
  /// muestra el chip "a X km".
  final double? distanceToOriginKm;
  /// Si la lista detectó esta solicitud como "nueva" (apareció en un
  /// poll reciente), se muestra el badge "Nuevo" animado.
  final bool isNew;
  /// Cantidad de fotos del paquete (solo envíos). Null = aún no se sabe;
  /// 0 = sin fotos. Si es mayor a 0 se muestra el chip "N fotos".
  final int? photoCount;
  final VoidCallback onTap;
  /// La cuenta regresiva llegó a cero: la lista recarga.
  final VoidCallback? onExpired;

  const TripRequestCardCompact({
    super.key,
    required this.trip,
    required this.counter,
    required this.onTap,
    this.distanceToOriginKm,
    this.isNew = false,
    this.photoCount,
    this.onExpired,
  });

  static String _timeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inSeconds < 60) return 'hace ${diff.inSeconds}s';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    return 'hace ${diff.inHours} h';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;

    // ── Estado de negociación (pill + color del borde) ──
    // Prioridad: Confirmar > Te ofrece > Aceptaste la tarifa > Esperando.
    final waitingConfirm = counter?.isWaitingMyConfirmation == true;
    final passengerOffer = counter?.isCounterFromPassenger == true;
    final iAcceptedFare =
        !waitingConfirm && !passengerOffer && counter?.isMyDriverAccepted == true;
    _Pill? statusPill;
    Color? borderTint;
    if (waitingConfirm) {
      statusPill = _Pill(
        icon: Icons.check_circle,
        text: trip.isDelivery ? 'Confirmar envío' : 'Confirmar viaje',
        color: BugieColors.success,
      );
      borderTint = BugieColors.success;
    } else if (passengerOffer) {
      statusPill = _Pill(
        icon: Icons.swap_horiz,
        text: 'Te ofrece ${formatSoles(counter!.fare)}',
        color: BugieColors.primary,
      );
      borderTint = BugieColors.primary;
    } else if (iAcceptedFare) {
      final accepted = counter!.myAcceptedFare;
      statusPill = _Pill(
        icon: Icons.thumb_up_alt_outlined,
        text: accepted != null
            ? 'Aceptaste la tarifa · ${formatSoles(accepted)}'
            : 'Aceptaste la tarifa',
        color: BugieColors.info,
      );
      borderTint = BugieColors.info;
    } else if (counter?.isMyPending == true) {
      statusPill = const _Pill(
        icon: Icons.hourglass_top,
        text: 'Esperando al pasajero',
        color: BugieColors.warning,
      );
      borderTint = BugieColors.warning;
    } else if (counter?.isRejected == true) {
      statusPill = const _Pill(
        icon: Icons.block,
        text: 'Rechazó tu oferta',
        color: BugieColors.danger,
      );
    }

    // Tarifa: si hay negociación usa counter.fare, sino lo que ofrece el
    // pasajero (estimatedFare). proposedFare es la primera propuesta de
    // algún conductor: no es lo que ofrece el pasajero.
    // Si solo acepté la tarifa se muestra el monto aceptado; un monto 0
    // (no vino del backend) cae a la tarifa del viaje.
    final counterFare = iAcceptedFare
        ? (counter!.myAcceptedFare ?? counter!.fare)
        : counter?.fare;
    final fare = (counterFare != null && counterFare > 0)
        ? counterFare
        : trip.estimatedFare;
    final fareLabel = waitingConfirm
        ? 'Aceptó'
        : passengerOffer
            ? 'Te propone'
            : iAcceptedFare
                ? 'Aceptaste'
                : counter?.isMyPending == true
                    ? 'Tu propuesta'
                    : 'Ofrece';

    String? distText;
    if (distanceToOriginKm != null) {
      final d = distanceToOriginKm!;
      final dStr = d < 1
          ? '${(d * 1000).toStringAsFixed(0)} m'
          : '${d.toStringAsFixed(1)} km';
      final min = (d / 22.0 * 60.0).round();
      distText = min < 1 ? 'a $dStr' : 'a $dStr · $min min';
    }
    final stops = trip.waypoints.length;

    return AnimatedContainer(
      duration: motionDuration(context, 250),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: borderTint?.withValues(alpha: 0.7) ??
              (isNew ? BugieColors.primary.withValues(alpha: 0.5) : c.border),
          width: borderTint != null || isNew ? 1.4 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── Cabecera: Nuevo + servicio + tiempo | estado ──
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          AnimatedSwitcher(
                            duration: motionDuration(context, 250),
                            transitionBuilder: (child, a) =>
                                ScaleTransition(scale: a, child: child),
                            child: isNew
                                ? const NewBadge(key: ValueKey('new'))
                                : const SizedBox.shrink(
                                    key: ValueKey('old')),
                          ),
                          _Pill(
                            icon: serviceIcon(trip.isDelivery),
                            text: serviceLabel(trip.isDelivery),
                            color: serviceColor(trip.isDelivery),
                          ),
                          Text(
                            _timeAgo(trip.createdAt),
                            style:
                                TextStyle(fontSize: 11.5, color: c.textMuted),
                          ),
                        ],
                      ),
                    ),
                    if (statusPill != null) ...[
                      const SizedBox(width: 6),
                      Flexible(child: statusPill),
                    ],
                  ],
                ),
                // Programado: fecha y hora del recojo.
                if (trip.scheduledAt != null) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child:
                        ScheduledBadge(at: trip.scheduledAt!, compact: true),
                  ),
                ],
                // Vencimiento (confirmar propuesta aceptada / hora del programado).
                if (trip.expiresAt != null) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: ExpiryCountdown(
                      expiresAt: trip.expiresAt!,
                      reason: trip.expiresReason,
                      onExpired: onExpired,
                    ),
                  ),
                ],
                // Calificación del pasajero (hoy siempre null: no se pinta).
                if (trip.passengerRating != null) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: PassengerRatingChip(
                      rating: trip.passengerRating,
                      count: trip.passengerRatingCount,
                    ),
                  ),
                ],
                const SizedBox(height: 8),

                // ── PRECIO grande ──
                PriceTag(
                  amount: fare,
                  label: fareLabel,
                  fontSize: 28,
                  highlight: counter?.isCounterFromPassenger == true,
                ),
                const SizedBox(height: 8),

                // ── Chips ──
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (distText != null)
                      InfoChip(
                        icon: Icons.near_me_outlined,
                        text: distText,
                        color: BugieColors.primary,
                      ),
                    InfoChip(
                      icon: trip.paymentMethod == 'cash'
                          ? Icons.payments_outlined
                          : Icons.qr_code_2_rounded,
                      text: _payLabel(trip.paymentMethod),
                    ),
                    if (stops > 0)
                      InfoChip(
                        icon: Icons.more_vert,
                        text: stops == 1 ? '1 parada' : '$stops paradas',
                        color: BugieColors.mapWaypoint,
                      ),
                    if (trip.isDelivery && trip.packageIsFragile)
                      const InfoChip(
                        icon: Icons.warning_amber_rounded,
                        text: 'Frágil',
                        color: BugieColors.danger,
                      ),
                    if (trip.isDelivery && (photoCount ?? 0) > 0)
                      InfoChip(
                        icon: Icons.photo_library_outlined,
                        text: photoCount == 1 ? '1 foto' : '$photoCount fotos',
                        color: BugieColors.accent,
                      ),
                  ],
                ),

                // Envío: qué paquete es.
                if (trip.isDelivery &&
                    (trip.packageDescription ?? '').trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.inventory_2,
                          size: 15, color: BugieColors.accent),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          trip.packageDescription!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: c.text,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 12),

                // Origen → Destino con timeline visual
                _OriginDestTimeline(
                  origin: trip.originAddress,
                  destination: trip.destAddress,
                ),
                const SizedBox(height: 14),

                // ── Botón "Ver": abre el detalle (igual que tocar la tarjeta) ──
                // Tonal (suave) para que la lista no sea una pared de botones
                // azules; lleno y verde solo cuando hay que confirmar.
                _SeeButton(
                  label: counter?.isWaitingMyConfirmation == true
                      ? 'Ver y confirmar'
                      : counter?.isCounterFromPassenger == true
                          ? 'Ver y responder'
                          : 'Ver solicitud',
                  color: counter?.isWaitingMyConfirmation == true
                      ? BugieColors.success
                      : BugieColors.primary,
                  filled: counter?.isWaitingMyConfirmation == true,
                  onTap: onTap,
                ),
              ],
            ),
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

/// Botón "Ver solicitud ›" de la tarjeta: 48 dp, texto + flecha a la derecha.
class _SeeButton extends StatelessWidget {
  final String label;
  final Color color;
  final bool filled;
  final VoidCallback onTap;
  const _SeeButton({
    required this.label,
    required this.color,
    required this.filled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final fg = filled ? Colors.white : color;
    return Material(
      color: filled ? color : color.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: fg,
                    ),
                  ),
                ),
                Icon(Icons.arrow_forward_rounded, size: 20, color: fg),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

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
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Flexible(
            child: Text(text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11.5,
                  color: color,
                  fontWeight: FontWeight.w700,
                )),
          ),
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
                  color: context.bugie.border,
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
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: context.bugie.text,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  destination,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: context.bugie.text,
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