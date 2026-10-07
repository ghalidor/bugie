import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import '../../../core/widgets/support_contact_sheet.dart';
import '../../auth/data/auth_repository.dart';
import '../../notifications/presentation/notifications_bell.dart';
import '../../passenger/presentation/home_shared.dart';
import '../../trips/data/trips_repository.dart';
import '../../../core/widgets/confirm_logout.dart';

/// "Cuenta" del conductor, ordenada en grupos:
///   Trabajo · Mi perfil · App · Cerrar sesión.
/// Conserva todas las opciones de antes (Ir en línea, Solicitudes entrantes,
/// Mis ganancias...) aunque también estén en el menú inferior.
class DriverAccountScreen extends StatefulWidget {
  const DriverAccountScreen({super.key});

  @override
  State<DriverAccountScreen> createState() => _DriverAccountScreenState();
}

class _DriverAccountScreenState extends State<DriverAccountScreen> {
  /// Calificación real del perfil (null = aún sin calificaciones o sin dato).
  double? _rating;
  int _ratingCount = 0;
  bool _ratingLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadRating();
  }

  Future<void> _loadRating() async {
    try {
      final r = await context.read<TripsRepository>().getMyRatingSummary();
      if (mounted) {
        setState(() {
          _rating = r.rating;
          _ratingCount = r.count;
          _ratingLoaded = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _ratingLoaded = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final user = context.watch<Session>().user;
    final name = user?.fullName ?? 'Conductor';

    final groups = <Widget>[
      _MenuGroup(title: 'Trabajo', items: [
        _MenuItem(
          icon: Icons.wifi_tethering,
          label: 'Ir en línea',
          onTap: () => context.push('/driver/go-online'),
        ),
        _MenuItem(
          icon: Icons.notifications_active_outlined,
          label: 'Solicitudes',
          onTap: () => context.push('/driver/requests'),
        ),
        _MenuItem(
          icon: Icons.directions_car_outlined,
          label: 'Viaje en curso',
          onTap: () => context.push('/driver/trip-in-progress'),
        ),
        _MenuItem(
          icon: Icons.history,
          label: 'Mis viajes y envíos',
          onTap: () => context.push('/driver/my-trips'),
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
          icon: Icons.history_toggle_off,
          label: 'Mis conexiones',
          onTap: () => context.push('/driver/connections'),
        ),
        _MenuItem(
          icon: Icons.stars_rounded,
          label: 'Mis puntos',
          onTap: () => context.push('/driver/rewards'),
        ),
      ]),
      _MenuGroup(title: 'Mi perfil', items: [
        _MenuItem(
          icon: Icons.person_outline,
          label: 'Mis datos',
          onTap: () => context.push('/driver/profile'),
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
      ]),
      _MenuGroup(title: 'App', items: [
        _MenuItem(
          icon: Icons.settings_outlined,
          label: 'Configuración',
          onTap: () => context.push('/driver/settings'),
        ),
        _MenuItem(
          icon: Icons.help_outline,
          label: 'Ayuda',
          onTap: () => showSupportContactSheet(context),
        ),
        _MenuItem(
          icon: Icons.emergency_share_outlined,
          label: 'SOS / Emergencia',
          color: BugieColors.danger,
          onTap: () => context.push('/driver/sos'),
        ),
      ]),
      _MenuGroup(items: [
        _MenuItem(
          icon: Icons.logout,
          label: 'Cerrar sesión',
          color: BugieColors.danger,
          showChevron: false,
          onTap: () async {
            if (!await confirmLogout(context) || !context.mounted) return;
            await context.read<AuthRepository>().logout();
            if (context.mounted) context.go('/');
          },
        ),
      ]),
    ];

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _loadRating,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
            children: [
              const Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  NotificationsBell(),
                  BugieThemeToggle(),
                ],
              ),
              const Center(child: ProfileAvatar(radius: 42)),
              const SizedBox(height: 10),
              Text(
                name,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: BugieText.h3.copyWith(color: c.text),
              ),
              const SizedBox(height: 6),
              Center(child: _RatingPill(
                  rating: _rating, count: _ratingCount, loaded: _ratingLoaded)),
              const SizedBox(height: 16),
              for (var i = 0; i < groups.length; i++)
                _StaggeredIn(index: i, child: groups[i]),
            ],
          ),
        ),
      ),
    );
  }
}

/// Calificación del conductor. Sin dato real, no inventamos un número.
class _RatingPill extends StatelessWidget {
  final double? rating;
  final int count;
  final bool loaded;
  const _RatingPill(
      {required this.rating, required this.count, required this.loaded});

  @override
  Widget build(BuildContext context) {
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final hasRating = rating != null && rating! > 0;
    return AnimatedOpacity(
      opacity: loaded ? 1 : 0,
      duration: noAnim ? Duration.zero : const Duration(milliseconds: 300),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          gradient: bugieGradient,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              hasRating ? rating!.toStringAsFixed(1) : 'Sin calificaciones aún',
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 13),
            ),
            if (hasRating) ...[
              const SizedBox(width: 4),
              const Icon(Icons.star, color: Colors.white, size: 14),
              if (count > 0) ...[
                const SizedBox(width: 4),
                Text('($count)',
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 12.5)),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

/// Grupo del menú: título pequeño + tarjeta con sus opciones.
class _MenuGroup extends StatelessWidget {
  final String? title;
  final List<Widget> items;
  const _MenuGroup({this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
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
            borderRadius: BorderRadius.circular(BugieRadius.md),
            clipBehavior: Clip.antiAlias,
            child: Container(
              decoration: BoxDecoration(
                border: Border.all(color: c.border),
                borderRadius: BorderRadius.circular(BugieRadius.md),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < items.length; i++) ...[
                    if (i > 0)
                      Divider(height: 1, indent: 56, color: c.border),
                    items[i],
                  ],
                ],
              ),
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

/// Entrada escalonada: cada grupo aparece un poco después del anterior
/// (fundido + leve subida). Sin animación si el celular las desactivó.
class _StaggeredIn extends StatelessWidget {
  final int index;
  final Widget child;
  const _StaggeredIn({required this.index, required this.child});

  @override
  Widget build(BuildContext context) {
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (noAnim) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 320 + 70 * index),
      curve: Interval(
        (index * 0.12).clamp(0.0, 0.6),
        1,
        curve: Curves.easeOutCubic,
      ),
      builder: (_, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(
          offset: Offset(0, 16 * (1 - t)),
          child: child,
        ),
      ),
      child: child,
    );
  }
}
