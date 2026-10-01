import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import 'home_shared.dart';

/// "Mi cuenta" — menú del pasajero (mockup Perfil / Cuenta).
/// El contenido de datos personales vive en "Mis datos" (/passenger/profile).
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final user = context.watch<Session>().user;
    final name = user?.fullName ?? 'Usuario';

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: Column(
          children: [
            // Barra superior: campanita + toggle (mezclada con el tema)
            Padding(
              padding: const EdgeInsets.only(right: 8, top: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  IconButton(
                    icon: Icon(Icons.notifications_none, color: c.text),
                    tooltip: 'Notificaciones',
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

            // Avatar + nombre + rating
            const ProfileAvatar(radius: 42),
            const SizedBox(height: 10),
            Text(name,
                style: BugieText.h3.copyWith(color: c.text)),
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

            // Menú
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                children: [
                  _MenuItem(
                    icon: Icons.person_outline,
                    label: 'Mis datos',
                    onTap: () => context.push('/passenger/profile'),
                  ),
                  _MenuItem(
                    icon: Icons.directions_car_outlined,
                    label: 'Mis viajes',
                    onTap: () => context.push('/passenger/trips'),
                  ),
                  _MenuItem(
                    icon: Icons.local_shipping_outlined,
                    label: 'Mis envíos',
                    onTap: () => _soon(context),
                  ),
                  _MenuItem(
                    icon: Icons.stars_rounded,
                    label: 'Mis puntos',
                    onTap: () => context.push('/passenger/rewards'),
                  ),
                  _MenuItem(
                    icon: Icons.card_giftcard_outlined,
                    label: 'Promociones',
                    onTap: () => _soon(context),
                  ),
                  _MenuItem(
                    icon: Icons.credit_card_outlined,
                    label: 'Métodos de pago',
                    onTap: () => context.push('/passenger/payments'),
                  ),
                  _MenuItem(
                    icon: Icons.shield_outlined,
                    label: 'Seguridad',
                    onTap: () => context.push('/passenger/verification'),
                  ),
                  _MenuItem(
                    icon: Icons.emergency_share_outlined,
                    label: 'SOS / Emergencia',
                    onTap: () => context.push('/passenger/sos'),
                  ),
                  _MenuItem(
                    icon: Icons.settings_outlined,
                    label: 'Configuración',
                    onTap: () => _soon(context),
                  ),
                  _MenuItem(
                    icon: Icons.help_outline,
                    label: 'Ayuda',
                    onTap: () => _soon(context),
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

  void _soon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Próximamente'),
        duration: Duration(seconds: 2),
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
