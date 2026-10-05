import 'package:flutter/material.dart';
import '../theme/bugie_theme.dart';

/// Icono del tipo de servicio (misma convención que la web):
///   - Viaje: Icons.directions_car
///   - Envío: Icons.inventory_2
IconData serviceIcon(bool isDelivery) =>
    isDelivery ? Icons.inventory_2 : Icons.directions_car;

/// Texto corto del tipo de servicio: "Viaje" / "Envío".
String serviceLabel(bool isDelivery) => isDelivery ? 'Envío' : 'Viaje';

/// Color del tipo de servicio: azul para viaje, rosa para envío.
Color serviceColor(bool isDelivery) =>
    isDelivery ? BugieColors.accent : BugieColors.primary;

/// Pastilla con icono + texto "Viaje" / "Envío".
///
/// Uso: `ServiceBadge(isDelivery: trip.isDelivery)`.
/// Con [compact] se ve más pequeña (para listas).
class ServiceBadge extends StatelessWidget {
  final bool isDelivery;
  final bool compact;

  const ServiceBadge({
    super.key,
    required this.isDelivery,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = serviceColor(isDelivery);
    return Container(
      padding: EdgeInsets.symmetric(
          horizontal: compact ? 7 : 10, vertical: compact ? 2 : 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(serviceIcon(isDelivery), size: compact ? 12 : 14, color: color),
          const SizedBox(width: 4),
          Text(
            serviceLabel(isDelivery),
            style: TextStyle(
              color: color,
              fontSize: compact ? 11 : 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
