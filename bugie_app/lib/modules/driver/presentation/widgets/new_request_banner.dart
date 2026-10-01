import 'package:flutter/material.dart';
import '../../../../core/theme/bugie_theme.dart';

/// Banner que se muestra encima del mapa (en el detalle) cuando llega
/// una NUEVA solicitud mientras el conductor está revisando otra.
/// Al tocarlo, vuelve a la lista de solicitudes.
///
/// Es pequeño, no ocupa toda la pantalla. Se descarta solo después de
/// unos segundos si el conductor no lo toca.
class NewRequestBanner extends StatelessWidget {
  /// Cantidad de solicitudes nuevas detectadas desde que el conductor
  /// entró al detalle. Mostramos "1 nueva" o "3 nuevas" según el caso.
  final int count;
  /// Tarifa de la última solicitud nueva (la más reciente). Es opcional.
  final double? lastFare;
  /// Distancia en km al origen de la última solicitud (opcional).
  final double? lastDistanceKm;
  final VoidCallback onTap;

  const NewRequestBanner({
    super.key,
    required this.count,
    required this.onTap,
    this.lastFare,
    this.lastDistanceKm,
  });

  @override
  Widget build(BuildContext context) {
    // Texto secundario: si tenemos info de la última, la mostramos.
    final extras = <String>[];
    if (lastFare != null) extras.add('S/ ${lastFare!.toStringAsFixed(2)}');
    if (lastDistanceKm != null) {
      final d = lastDistanceKm! < 1
          ? '${(lastDistanceKm! * 1000).toStringAsFixed(0)} m'
          : '${lastDistanceKm!.toStringAsFixed(1)} km';
      extras.add('a $d tuyo');
    }
    final subtitle = extras.isEmpty ? null : extras.join(' · ');

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: BugieColors.primary,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.4),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              // Iconito de campana
              Container(
                width: 32, height: 32,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.notifications_active,
                  size: 16,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      count == 1
                          ? 'Nueva solicitud llegó'
                          : '$count nuevas solicitudes',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.white.withOpacity(0.85),
                        ),
                      ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, size: 18, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}
