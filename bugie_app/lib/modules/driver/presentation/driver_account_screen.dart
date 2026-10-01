import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import '../../passenger/presentation/home_shared.dart';

/// "Mi cuenta" del conductor. Reúne los menús que antes estaban en el
/// dashboard (ir en línea, solicitudes, ganancias, documentos, etc.).
class DriverAccountScreen extends StatelessWidget {
  const DriverAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final user = context.watch<Session>().user;
    final name = user?.fullName ?? 'Conductor';

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.only(right: 8, top: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  IconButton(
                    icon: Icon(Icons.notifications_none, color: c.text),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Notificaciones — próximamente'),
                          duration: Duration(seconds: 2),
                        ),
                      );
                    },
                  ),
                  const BugieThemeToggle(),
                ],
              ),
            ),
            const ProfileAvatar(radius: 42),
            const SizedBox(height: 10),
            Text(name, style: BugieText.h3.copyWith(color: c.text)),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                gradient: bugieGradient,
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('4.9',
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 13)),
                  SizedBox(width: 4),
                  Icon(Icons.star, color: Colors.white, size: 14),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                children: [
                  _MenuItem(
                    icon: Icons.wifi_tethering,
                    label: 'Ir en línea',
                    onTap: () => context.push('/driver/go-online'),
                  ),
                  _MenuItem(
                    icon: Icons.notifications_active_outlined,
                    label: 'Solicitudes entrantes',
                    onTap: () => context.push('/driver/requests'),
                  ),
                  _MenuItem(
                    icon: Icons.directions_car_outlined,
                    label: 'Viaje en curso',
                    onTap: () => context.push('/driver/trip-in-progress'),
                  ),
                  _MenuItem(
                    icon: Icons.person_outline,
                    label: 'Mis datos',
                    onTap: () => context.push('/driver/profile'),
                  ),
                  _MenuItem(
                    icon: Icons.stars_rounded,
                    label: 'Mis puntos',
                    onTap: () => context.push('/driver/rewards'),
                  ),
                  _MenuItem(
                    icon: Icons.account_balance_wallet_outlined,
                    label: 'Mis ganancias',
                    onTap: () => context.push('/driver/earnings'),
                  ),
                  _MenuItem(
                    icon: Icons.star_outline,
                    label: 'Mis calificaciones',
                    onTap: () => context.push('/driver/ratings'),
                  ),
                  _MenuItem(
                    icon: Icons.badge_outlined,
                    label: 'Documentos',
                    onTap: () => context.push('/driver/documents'),
                  ),
                  _MenuItem(
                    icon: Icons.directions_car_filled_outlined,
                    label: 'Vehículos',
                    onTap: () => context.push('/driver/vehicles'),
                  ),
                  _MenuItem(
                    icon: Icons.emergency_share_outlined,
                    label: 'SOS / Emergencia',
                    onTap: () => context.push('/driver/sos'),
                  ),
                  _MenuItem(
                    icon: Icons.logout,
                    label: 'Cerrar sesión',
                    onTap: () async {
                      await context.read<Session>().clear();
                      if (context.mounted) context.go('/');
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _MenuItem(
      {required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return ListTile(
      leading: Icon(icon, color: c.text),
      title: Text(label, style: TextStyle(color: c.text, fontSize: 15)),
      trailing: Icon(Icons.chevron_right, color: c.textMuted),
      onTap: onTap,
    );
  }
}
