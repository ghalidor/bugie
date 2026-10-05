import 'package:flutter/material.dart';
import '../services/in_app_alert_service.dart';
import '../theme/bugie_theme.dart';
import 'from_badge.dart';
import 'service_badge.dart';

/// Color de un aviso según su tipo (banner y bandeja de notificaciones).
Color alertColor(AlertType type) {
  switch (type) {
    case AlertType.trip:      return BugieColors.primary;
    case AlertType.proposal:  return BugieColors.warning;
    case AlertType.accepted:  return BugieColors.success;
    case AlertType.sos:       return BugieColors.danger;
    case AlertType.warning:   return BugieColors.warning;
    case AlertType.arrived:   return BugieColors.success;
    case AlertType.delivery:  return BugieColors.accent;
    case AlertType.deviation: return BugieColors.danger;
    case AlertType.points:    return BugieColors.warning;
    case AlertType.payout:    return BugieColors.success;
    case AlertType.cancelled: return BugieColors.textMuted;
    case AlertType.accountApproved:  return BugieColors.success;
    case AlertType.accountRejected:  return BugieColors.danger;
    case AlertType.documentExpiring: return BugieColors.warning;
    case AlertType.accountSuspended:   return BugieColors.danger;
    case AlertType.accountReactivated: return BugieColors.success;
    case AlertType.reviewKept:         return BugieColors.warning;
  }
}

/// Ícono de un aviso según su tipo. [service] ('ride' | 'delivery') afina
/// el ícono de las solicitudes.
IconData alertIcon(AlertType type, {String? service}) {
  switch (type) {
    // Solicitud: si el push dice el servicio, usamos su icono (auto/caja).
    case AlertType.trip:
      return service != null
          ? serviceIcon(service == 'delivery')
          : Icons.local_taxi_rounded;
    case AlertType.proposal:  return Icons.attach_money_rounded;
    case AlertType.accepted:  return Icons.check_circle_rounded;
    case AlertType.sos:       return Icons.warning_amber_rounded;
    case AlertType.warning:   return Icons.description_outlined;
    case AlertType.arrived:   return Icons.where_to_vote_rounded;
    case AlertType.delivery:  return Icons.inventory_2;
    case AlertType.deviation: return Icons.alt_route_rounded;
    case AlertType.points:    return Icons.stars_rounded;
    case AlertType.payout:    return Icons.payments_rounded;
    case AlertType.cancelled: return Icons.cancel_outlined;
    case AlertType.accountApproved:  return Icons.check_circle_rounded;
    case AlertType.accountRejected:  return Icons.gpp_bad_outlined;
    case AlertType.documentExpiring: return Icons.event_busy_rounded;
    case AlertType.accountSuspended:   return Icons.block_rounded;
    case AlertType.accountReactivated: return Icons.verified_user_rounded;
    case AlertType.reviewKept:         return Icons.gavel_rounded;
  }
}

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

  Color get _bg => alertColor(data.type);
  IconData get _icon => alertIcon(data.type, service: data.service);

  /// Propuestas/contraofertas: banner más grande y con borde para que se
  /// note más (es algo que el usuario tiene que responder).
  bool get _emphasized => data.type == AlertType.proposal;

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
            padding: _emphasized
                ? const EdgeInsets.fromLTRB(14, 14, 8, 14)
                : const EdgeInsets.fromLTRB(14, 12, 8, 12),
            decoration: BoxDecoration(
              color: _bg,
              borderRadius: BorderRadius.circular(16),
              border: _emphasized
                  ? Border.all(color: Colors.white.withOpacity(0.7), width: 1.5)
                  : null,
              boxShadow: [
                BoxShadow(
                  color: _bg.withOpacity(_emphasized ? 0.6 : 0.4),
                  blurRadius: _emphasized ? 24 : 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Ícono circular
                Container(
                  width: _emphasized ? 44 : 36,
                  height: _emphasized ? 44 : 36,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.22),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(_icon,
                      color: Colors.white, size: _emphasized ? 24 : 20),
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
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: _emphasized ? 15.5 : 14,
                          fontWeight:
                              _emphasized ? FontWeight.w800 : FontWeight.w700,
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
                      // Servicio (Viaje/Envío) y de quién viene el aviso.
                      if (data.service != null || data.from != null) ...[
                        const SizedBox(height: 4),
                        Wrap(
                          spacing: 10,
                          runSpacing: 2,
                          children: [
                            if (data.service != null)
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(serviceIcon(data.isDelivery),
                                      size: 14, color: Colors.white),
                                  const SizedBox(width: 4),
                                  Text(
                                    serviceLabel(data.isDelivery),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            if (data.from != null)
                              FromBadge(from: data.from, color: Colors.white),
                          ],
                        ),
                      ],
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
            final noAnim = MediaQuery.of(context).disableAnimations;
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: alerts.map((a) {
                final emphasized = a.type == AlertType.proposal;
                final banner = AlertBanner(
                  data: a,
                  onDismiss: () => InAppAlertService().dismiss(a.id),
                  onTap: () => InAppAlertService().handleTap(a),
                );
                // Entrada: baja desde arriba con un rebote suave (las
                // propuestas, un poco más marcado).
                return TweenAnimationBuilder<double>(
                  key: ValueKey(a.id),
                  tween: Tween(begin: 0.0, end: 1.0),
                  duration: noAnim
                      ? Duration.zero
                      : Duration(milliseconds: emphasized ? 520 : 320),
                  curve: Curves.easeOutBack,
                  builder: (context, t, child) {
                    return Opacity(
                      opacity: t.clamp(0.0, 1.0),
                      child: Transform.translate(
                        offset: Offset(0, (emphasized ? -60 : -30) * (1 - t)),
                        child: Transform.scale(
                          scale: emphasized ? 0.9 + 0.1 * t : 1,
                          child: child,
                        ),
                      ),
                    );
                  },
                  child: banner,
                );
              }).toList(),
            );
          },
        ),
      ),
    );
  }
}
