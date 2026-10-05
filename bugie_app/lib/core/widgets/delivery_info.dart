import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../modules/trips/domain/trip_model.dart';
import '../theme/bugie_theme.dart';
import 'trip_photos_gallery.dart';

/// Estado del envío en una línea, según lo que trae el viaje:
///   - "Entregado a X, 14:35"            (hay confirmación de entrega)
///   - "Paquete recogido y verificado"    (el conductor verificó el recojo)
///   - "Envío cancelado"
///   - "Esperando recojo"
String deliveryStatusText(Trip t) {
  if (t.deliveryConfirmedAt != null || t.deliveryReceivedBy != null) {
    final who = (t.deliveryReceivedBy ?? '').trim();
    final at = t.deliveryConfirmedAt;
    final hour = at == null ? '' : ', ${_formatAt(at.toLocal())}';
    return who.isEmpty ? 'Entregado$hour' : 'Entregado a $who$hour';
  }
  if (t.status == TripStatus.cancelled) return 'Envío cancelado';
  if (t.pickupVerified) return 'Paquete recogido y verificado';
  return 'Esperando recojo';
}

/// Hora si es de hoy; si no, fecha + hora.
String _formatAt(DateTime d) {
  final now = DateTime.now();
  final today = d.year == now.year && d.month == now.month && d.day == now.day;
  return today
      ? DateFormat('HH:mm').format(d)
      : DateFormat('dd/MM/yyyy HH:mm').format(d);
}

/// Detalle de un envío: paquete (descripción, peso, frágil, detalles),
/// destinatario, estado del envío y galería de fotos.
///
/// No dibuja tarjeta: quien lo usa lo pone dentro de su BugieCard/Container.
/// Lo usan el seguimiento y el detalle del pasajero y la pantalla del
/// conductor durante el envío.
class DeliveryInfo extends StatelessWidget {
  final Trip trip;
  final bool showStatus;
  final bool showRecipient;
  final bool showGallery;

  const DeliveryInfo({
    super.key,
    required this.trip,
    this.showStatus = true,
    this.showRecipient = true,
    this.showGallery = true,
  });

  @override
  Widget build(BuildContext context) {
    final t = trip;
    final c = context.bugie;
    final delivered =
        t.deliveryConfirmedAt != null || t.deliveryReceivedBy != null;
    final statusColor = delivered
        ? BugieColors.success
        : t.status == TripStatus.cancelled
            ? c.textMuted
            : t.pickupVerified
                ? BugieColors.primary
                : BugieColors.warning;
    final weight = t.packageWeightKg;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── Paquete ──
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.inventory_2, size: 20, color: BugieColors.accent),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                (t.packageDescription ?? '').trim().isEmpty
                    ? 'Paquete'
                    : t.packageDescription!,
                style: TextStyle(
                    color: c.text, fontSize: 14, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            if (weight != null)
              _Chip(
                icon: Icons.scale_outlined,
                text: '${weight % 1 == 0 ? weight.toStringAsFixed(0) : weight.toStringAsFixed(1)} kg',
                color: c.textMuted,
              ),
            if (t.packageIsFragile)
              const _Chip(
                icon: Icons.warning_amber_rounded,
                text: 'Frágil',
                color: BugieColors.danger,
              ),
          ],
        ),
        if ((t.packageDetails ?? '').trim().isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(t.packageDetails!,
              style: TextStyle(color: c.textMuted, fontSize: 13)),
        ],

        // ── Destinatario ──
        if (showRecipient &&
            ((t.recipientName ?? '').isNotEmpty ||
                (t.recipientPhone ?? '').isNotEmpty)) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.person_pin_circle_outlined,
                  size: 18, color: c.textMuted),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Destinatario: ${[
                    if ((t.recipientName ?? '').isNotEmpty) t.recipientName!,
                    if ((t.recipientPhone ?? '').isNotEmpty) t.recipientPhone!,
                  ].join(' · ')}',
                  style: TextStyle(color: c.text, fontSize: 13),
                ),
              ),
            ],
          ),
        ],

        // ── Estado del envío ──
        if (showStatus) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  delivered
                      ? Icons.check_circle
                      : t.pickupVerified
                          ? Icons.verified_outlined
                          : Icons.schedule,
                  size: 16,
                  color: statusColor,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    deliveryStatusText(t),
                    style: TextStyle(
                        color: statusColor,
                        fontSize: 13,
                        fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
          if (t.pickupVerified &&
              (t.pickupObservation ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 6),
            Text('Observación del recojo: ${t.pickupObservation}',
                style: TextStyle(color: c.textMuted, fontSize: 12.5)),
          ],
        ],

        // ── Fotos ──
        if (showGallery) ...[
          const SizedBox(height: 14),
          // refreshKey: al cambiar el estado (recojo/entrega) se vuelven a pedir.
          TripPhotosGallery(
            tripId: t.id,
            refreshKey: '${t.status}-${t.pickupVerified}-${t.deliveryConfirmedAt}',
          ),
        ],
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;
  const _Chip({required this.icon, required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(text,
              style: TextStyle(
                  color: color, fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
