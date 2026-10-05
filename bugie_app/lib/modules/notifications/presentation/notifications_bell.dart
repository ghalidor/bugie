import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../data/notifications_badge.dart';

/// Campana con el número de notificaciones sin leer (99+). Abre la bandeja
/// del rol actual y, al volver, refresca el contador.
class NotificationsBell extends StatelessWidget {
  final Color? color;
  const NotificationsBell({super.key, this.color});

  void _open(BuildContext context) {
    final role = context.read<Session>().role;
    final path = role == UserRole.driver
        ? '/driver/notifications'
        : '/passenger/notifications';
    context.push(path).then((_) => NotificationsBadge().refresh());
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return ValueListenableBuilder<int>(
      valueListenable: NotificationsBadge().unread,
      builder: (context, n, _) => IconButton(
        tooltip: n > 0 ? 'Notificaciones ($n sin leer)' : 'Notificaciones',
        onPressed: () => _open(context),
        icon: Badge(
          isLabelVisible: n > 0,
          backgroundColor: BugieColors.danger,
          textColor: Colors.white,
          label: Text(n > 99 ? '99+' : '$n'),
          child: Icon(
            n > 0 ? Icons.notifications : Icons.notifications_none,
            color: color ?? c.text,
          ),
        ),
      ),
    );
  }
}
