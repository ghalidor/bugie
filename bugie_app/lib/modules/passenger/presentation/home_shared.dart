import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_config.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import '../../auth/data/auth_repository.dart';
import '../../driver/data/driver_repository.dart';

/// Widgets compartidos por el INICIO del pasajero y del conductor, para que
/// la parte de buscador → mapa → "Viajes seguros" → SOS se vea igual en ambos.

class HomeGreeting extends StatelessWidget {
  final String name;
  final String subtitle;
  const HomeGreeting({super.key, required this.name, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final role = context.read<Session>().user?.role;
    return Row(
      children: [
        const ProfileAvatar(radius: 22),
        const SizedBox(width: 12),
        Expanded(
          // Tocar el saludo lleva a "Mis datos".
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => context.push(role == UserRole.driver
                ? '/driver/profile'
                : '/passenger/profile'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('¡Hola, $name!',
                    style: BugieText.h3.copyWith(color: c.text)),
                Text(subtitle,
                    style: TextStyle(color: c.textMuted, fontSize: 13)),
              ],
            ),
          ),
        ),
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
    );
  }
}

class HomeSearchBar extends StatelessWidget {
  final String hint;
  final VoidCallback? onTap;
  const HomeSearchBar({super.key, required this.hint, this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(BugieRadius.sm),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: c.inputFill,
          borderRadius: BorderRadius.circular(BugieRadius.sm),
          border: Border.all(color: c.inputBorder),
        ),
        child: Row(
          children: [
            Icon(Icons.search, color: c.textMuted, size: 20),
            const SizedBox(width: 10),
            Text(hint, style: TextStyle(color: c.textMuted, fontSize: 15)),
          ],
        ),
      ),
    );
  }
}

class HomeSafetyCard extends StatelessWidget {
  const HomeSafetyCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: bugieGradient,
        borderRadius: BorderRadius.circular(BugieRadius.md),
      ),
      child: Row(
        children: const [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Viajes seguros',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold)),
                SizedBox(height: 4),
                Text('Conductores verificados',
                    style: TextStyle(color: Colors.white70, fontSize: 13)),
              ],
            ),
          ),
          Icon(Icons.verified_user, color: Colors.white, size: 32),
        ],
      ),
    );
  }
}

class HomeSosCard extends StatelessWidget {
  final VoidCallback onTap;
  const HomeSosCard({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFDC2626),
      borderRadius: BorderRadius.circular(BugieRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(BugieRadius.md),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: const [
              Icon(Icons.emergency_share, color: Colors.white, size: 28),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('SOS / Emergencia',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold)),
                    SizedBox(height: 4),
                    Text('Ayuda inmediata durante el viaje',
                        style: TextStyle(color: Colors.white70, fontSize: 13)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}

/// Avatar del usuario actual. Muestra su foto de perfil si la subió; si no,
/// un ícono de persona. La foto sale del perfil según el rol:
///   - Conductor → DriverRepository (service drivers)
///   - Pasajero  → AuthRepository (service auth)
class ProfileAvatar extends StatefulWidget {
  final double radius;
  final VoidCallback? onTap;
  const ProfileAvatar({super.key, this.radius = 22, this.onTap});

  @override
  State<ProfileAvatar> createState() => _ProfileAvatarState();
}

class _ProfileAvatarState extends State<ProfileAvatar> {
  @override
  void initState() {
    super.initState();
    // Carga la foto UNA sola vez para toda la app (se cachea en Session).
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadIfNeeded());
  }

  Future<void> _loadIfNeeded() async {
    if (!mounted) return;
    final session = context.read<Session>();
    if (session.photoFetched) return; // ya se cargó antes
    final role = session.user?.role;
    try {
      String? resolved;
      if (role == UserRole.driver) {
        final d = await context.read<DriverRepository>().getMyProfile();
        resolved = ApiConfig.resolveMediaUrl(d?.profilePhotoUrl,
            service: ApiService.drivers);
      } else {
        final p = await context.read<AuthRepository>().getMyProfile();
        resolved = ApiConfig.resolveMediaUrl(p?.profilePhotoUrl,
            service: ApiService.auth);
      }
      if (mounted) context.read<Session>().setProfilePhotoUrl(resolved);
    } catch (_) {
      // Error de red: no marcamos como cargada para reintentar luego.
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    // Se actualiza en TODOS lados cuando Session cambia (subir foto nueva).
    final session = context.watch<Session>();
    final url = session.profilePhotoUrl;
    final name = session.user?.fullName ?? 'Usuario';
    final hasPhoto = url != null && url.isNotEmpty;
    final avatar = CircleAvatar(
      radius: widget.radius,
      backgroundColor: c.surface,
      backgroundImage: hasPhoto ? NetworkImage(url) : null,
      child: hasPhoto
          ? null
          : Icon(Icons.person, color: c.textMuted, size: widget.radius * 1.1),
    );
    // Al tocar: si hay onTap se respeta; si no, abre el modal con la imagen
    // en grande (animación de agrandamiento) + el nombre.
    return GestureDetector(
      onTap: widget.onTap ??
          () => showProfileImageModal(context, imageUrl: url, name: name),
      child: avatar,
    );
  }
}

/// Modal flotante que muestra la foto de perfil en grande + el nombre, con una
/// animación de agrandamiento (zoom). Se cierra tocando fuera.
void showProfileImageModal(BuildContext context,
    {String? imageUrl, required String name}) {
  showGeneralDialog(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Cerrar',
    barrierColor: Colors.black87,
    transitionDuration: const Duration(milliseconds: 240),
    pageBuilder: (ctx, a1, a2) =>
        _ProfileImageModal(imageUrl: imageUrl, name: name),
    transitionBuilder: (ctx, anim, _, child) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutBack);
      return FadeTransition(
        opacity: anim,
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.75, end: 1.0).animate(curved),
          child: child,
        ),
      );
    },
  );
}

class _ProfileImageModal extends StatelessWidget {
  final String? imageUrl;
  final String name;
  const _ProfileImageModal({required this.imageUrl, required this.name});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final hasPhoto = imageUrl != null && imageUrl!.isNotEmpty;
    return Center(
      child: Material(
        color: Colors.transparent,
        child: GestureDetector(
          // Absorbe el toque para que tocar la tarjeta NO cierre el modal.
          onTap: () {},
          child: Container(
            constraints: const BoxConstraints(maxWidth: 340),
            margin: const EdgeInsets.symmetric(horizontal: 24),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: c.surface,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Imagen grande (cuadrada redondeada)
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: hasPhoto
                        ? Image.network(
                            imageUrl!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => _fallback(c),
                          )
                        : _fallback(c),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  name,
                  textAlign: TextAlign.center,
                  style: BugieText.h3.copyWith(color: c.text),
                ),
                const SizedBox(height: 6),
                Text(
                  'Toca fuera para cerrar',
                  style: TextStyle(color: c.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _fallback(BugieColorsExt c) => Container(
        color: c.bg,
        child: Icon(Icons.person, size: 120, color: c.textMuted),
      );
}
