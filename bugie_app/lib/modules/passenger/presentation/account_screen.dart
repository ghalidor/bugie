import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/api/api_config.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import '../../../core/widgets/support_contact_sheet.dart';
import '../../auth/data/auth_repository.dart';
import '../../notifications/presentation/notifications_bell.dart';
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

    // Mismo estilo que "Cuenta" del conductor: grupos con título y tarjetas
    // con separadores, para que la lista no sea una sola columna larga.
    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            // Barra superior: campanita + toggle (mezclada con el tema)
            const Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                NotificationsBell(),
                BugieThemeToggle(),
              ],
            ),

            // Avatar + nombre (los pasajeros no tienen calificación)
            const Center(child: ProfileAvatar(radius: 42)),
            const SizedBox(height: 10),
            Text(name,
                textAlign: TextAlign.center,
                style: BugieText.h3.copyWith(color: c.text)),
            const SizedBox(height: 22),

            _MenuGroup(title: 'Mi actividad', items: [
              _MenuItem(
                icon: Icons.directions_car_outlined,
                label: 'Mis viajes',
                onTap: () => context.push('/passenger/trips'),
              ),
              _MenuItem(
                icon: Icons.inventory_2_outlined,
                label: 'Mis envíos',
                onTap: () => context.push('/passenger/deliveries'),
              ),
              _MenuItem(
                icon: Icons.stars_rounded,
                label: 'Mis puntos',
                onTap: () => context.push('/passenger/rewards'),
              ),
              _MenuItem(
                icon: Icons.credit_card_outlined,
                label: 'Mis pagos',
                onTap: () => context.push('/passenger/payments'),
              ),
            ]),
            _MenuGroup(title: 'Mi perfil y seguridad', items: [
              _MenuItem(
                icon: Icons.person_outline,
                label: 'Mis datos',
                onTap: () => context.push('/passenger/profile'),
              ),
              _MenuItem(
                icon: Icons.shield_outlined,
                label: 'Seguridad',
                onTap: () => context.push('/passenger/verification'),
              ),
              _MenuItem(
                icon: Icons.emergency_share_outlined,
                label: 'SOS / Emergencia',
                color: BugieColors.danger,
                onTap: () => context.push('/passenger/sos'),
              ),
            ]),
            _MenuGroup(title: 'Ayuda y ajustes', items: [
              _MenuItem(
                icon: Icons.settings_outlined,
                label: 'Configuración',
                onTap: () => context.push('/passenger/settings'),
              ),
              _MenuItem(
                icon: Icons.help_outline,
                label: 'Ayuda',
                onTap: () => showSupportContactSheet(context),
              ),
              _MenuItem(
                icon: Icons.menu_book_outlined,
                label: 'Libro de Reclamaciones',
                onTap: () => _openComplaintsBook(context),
              ),
            ]),
            _MenuGroup(items: [
              _MenuItem(
                icon: Icons.logout,
                label: 'Cerrar sesión',
                color: BugieColors.danger,
                showChevron: false,
                onTap: () async {
                  // logout() quita el token push de este celular en el
                  // backend y luego borra la sesión local.
                  await context.read<AuthRepository>().logout();
                  if (context.mounted) context.go('/');
                },
              ),
            ]),
          ],
        ),
      ),
    );
  }

  /// Abre el Libro de Reclamaciones de la web en el navegador del celular.
  Future<void> _openComplaintsBook(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final uri = Uri.parse('${ApiConfig.webBase}/libro-reclamaciones');
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!opened) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
              'No pudimos abrir el Libro de Reclamaciones. Revisa que tengas '
              'un navegador instalado e inténtalo de nuevo.'),
          duration: Duration(seconds: 4),
        ),
      );
    }
  }
}

/// Grupo del menú: título en versalitas y una tarjeta con los ítems.
class _MenuGroup extends StatelessWidget {
  final String? title;
  final List<Widget> items;
  const _MenuGroup({this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: Text(
                title!.toUpperCase(),
                style: TextStyle(
                  color: c.textMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                ),
              ),
            ),
          Material(
            color: c.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(BugieRadius.md),
              side: BorderSide(color: c.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  if (i > 0) Divider(height: 1, indent: 56, color: c.border),
                  items[i],
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final bool showChevron;
  const _MenuItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
    this.showChevron = true,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final fg = color ?? c.text;
    return ListTile(
      minTileHeight: 56,
      leading: Icon(icon, color: fg),
      title: Text(
        label,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: fg,
          fontSize: 15,
          fontWeight: color != null ? FontWeight.w600 : FontWeight.normal,
        ),
      ),
      trailing:
          showChevron ? Icon(Icons.chevron_right, color: c.textMuted) : null,
      onTap: onTap,
    );
  }

}
