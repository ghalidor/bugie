import 'package:flutter/material.dart';
import '../services/in_app_alert_service.dart';
import '../theme/bugie_theme.dart';

/// Banner estilo iOS que se ancla al tope de la pantalla.
/// Soporta drag-to-dismiss y tap para acción/navegación.
class AlertBanner extends StatelessWidget {
  final AlertData data;

  /// Llamado cuando el usuario descarta el banner (drag o X).
  final VoidCallback onDismiss;

  /// Llamado cuando el usuario toca el banner o el botón de acción.
  /// Si la alerta tiene `route`, ahí se debería navegar.
  final VoidCallback onTap;

  const AlertBanner({
    super.key,
    required this.data,
    required this.onDismiss,
    required this.onTap,
  });

  // Color de fondo según tipo.
  Color get _bg {
    switch (data.type) {
      case AlertType.trip:      return BugieColors.primary;
      case AlertType.proposal:  return BugieColors.warning;
      case AlertType.accepted:  return BugieColors.success;
      case AlertType.sos:       return BugieColors.danger;
      case AlertType.warning:   return BugieColors.warning;
    }
  }

  // Ícono según tipo.
  IconData get _icon {
    switch (data.type) {
      case AlertType.trip:      return Icons.local_taxi_rounded;
      case AlertType.proposal:  return Icons.attach_money_rounded;
      case AlertType.accepted:  return Icons.check_circle_rounded;
      case AlertType.sos:       return Icons.warning_amber_rounded;
      case AlertType.warning:   return Icons.description_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: ValueKey(data.id),
      direction: DismissDirection.up,
      onDismissed: (_) => onDismiss(),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
            decoration: BoxDecoration(
              color: _bg,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: _bg.withOpacity(0.4),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Ícono circular
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.22),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(_icon, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 12),
                // Textos
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        data.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        data.body,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.92),
                          fontSize: 12.5,
                          height: 1.25,
                        ),
                      ),
                    ],
                  ),
                ),
                // Acción opcional
                if (data.actionLabel != null) ...[
                  const SizedBox(width: 6),
                  TextButton(
                    onPressed: onTap,
                    style: TextButton.styleFrom(
                      backgroundColor: Colors.white.withOpacity(0.22),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      minimumSize: const Size(0, 32),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: Text(
                      data.actionLabel!,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
                // Botón X
                IconButton(
                  onPressed: onDismiss,
                  icon: const Icon(Icons.close, color: Colors.white, size: 18),
                  splashRadius: 18,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(
                      minWidth: 32, minHeight: 32),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Host de los banners. Se monta UNA vez encima del MaterialApp (vía builder).
/// Escucha cambios en InAppAlertService.alerts y renderiza con animación.
class AlertOverlay extends StatelessWidget {
  const AlertOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        bottom: false,
        child: ValueListenableBuilder<List<AlertData>>(
          valueListenable: InAppAlertService().alerts,
          builder: (context, alerts, _) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: alerts.map((a) {
                return TweenAnimationBuilder<double>(
                  key: ValueKey(a.id),
                  tween: Tween(begin: 0.0, end: 1.0),
                  duration: const Duration(milliseconds: 280),
                  curve: Curves.easeOutCubic,
                  builder: (context, t, child) {
                    return Opacity(
                      opacity: t,
                      child: Transform.translate(
                        offset: Offset(0, -30 * (1 - t)),
                        child: child,
                      ),
                    );
                  },
                  child: AlertBanner(
                    data: a,
                    onDismiss: () => InAppAlertService().dismiss(a.id),
                    onTap: () => InAppAlertService().handleTap(a),
                  ),
                );
              }).toList(),
            );
          },
        ),
      ),
    );
  }
}