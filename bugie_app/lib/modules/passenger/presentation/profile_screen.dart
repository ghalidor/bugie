import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/session/session.dart';
import 'home_shared.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../auth/data/auth_repository.dart';
import '../../auth/domain/user_model.dart';

/// Perfil del pasajero.
/// Datos que muestra (todos vienen de GET /api/auth/me):
///   - Foto de perfil (subible)
///   - Nombre + correo
///   - Teléfono
///   - Estado de verificación de cuenta
///   - Miembro desde (fecha de creación)
///   - Acceso a Verificación de DNI (otra pantalla)
class PassengerProfileScreen extends StatefulWidget {
  const PassengerProfileScreen({super.key});

  @override
  State<PassengerProfileScreen> createState() => _PassengerProfileScreenState();
}

class _PassengerProfileScreenState extends State<PassengerProfileScreen> {
  UserProfile? _profile;
  bool _loading = true;
  bool _uploadingPhoto = false;
  /// Versión de foto: se incrementa al subir nueva para forzar a Image.network
  /// a no usar el cache. Misma técnica que en vehículos del conductor.
  int _photoVersion = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await context.read<AuthRepository>().getMyProfile();
      if (!mounted) return;
      setState(() {
        _profile = p;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _uploadPhoto() async {
    // Pregunta de dónde sacar la foto
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Tomar foto'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Elegir de la galería'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: source,
      maxWidth: 1200,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    setState(() => _uploadingPhoto = true);
    try {
      final newUrl =
          await context.read<AuthRepository>().uploadProfilePhoto(picked.path);
      if (!mounted) return;

      // Actualizar state local con la URL nueva (no esperar al GET).
      if (_profile != null && newUrl.isNotEmpty) {
        setState(() {
          _profile = UserProfile(
            id:               _profile!.id,
            fullName:         _profile!.fullName,
            email:            _profile!.email,
            phone:            _profile!.phone,
            role:             _profile!.role,
            isActive:         _profile!.isActive,
            isVerified:       _profile!.isVerified,
            profilePhotoUrl:  newUrl,
            createdAt:        _profile!.createdAt,
          );
          _photoVersion++;
        });
      }

      // Actualiza el avatar compartido (inicio + cuenta) al instante.
      if (newUrl.isNotEmpty) {
        final resolved =
            ApiConfig.resolveMediaUrl(newUrl, service: ApiService.auth);
        context.read<Session>().setProfilePhotoUrl(resolved == null
            ? null
            : '$resolved?v=${DateTime.now().millisecondsSinceEpoch}');
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Foto de perfil actualizada')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo subir la foto.')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<Session>().user;
    // Resuelve la URL de foto a una URL absoluta usando el host de Auth.
    final resolved = ApiConfig.resolveMediaUrl(
      _profile?.profilePhotoUrl,
      service: ApiService.auth,
    );
    final hasPhoto = resolved != null;
    final photoUrlWithCache = hasPhoto ? '$resolved?v=$_photoVersion' : null;

    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Mis datos'),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [
                    // ── Avatar + nombre + email ─────────────────────────
                    Center(
                      child: Column(
                        children: [
                          Stack(
                            children: [
                              GestureDetector(
                                onTap: () => showProfileImageModal(context,
                                    imageUrl: photoUrlWithCache,
                                    name: user?.fullName ?? 'Usuario'),
                                child: CircleAvatar(
                                radius: 50,
                                backgroundColor: BugieColors.primary,
                                backgroundImage: photoUrlWithCache != null
                                    ? NetworkImage(photoUrlWithCache)
                                    : null,
                                child: photoUrlWithCache != null
                                    ? null
                                    : Text(
                                        user?.fullName.isNotEmpty == true
                                            ? user!.fullName[0].toUpperCase()
                                            : 'P',
                                        style: const TextStyle(
                                            fontSize: 36,
                                            color: Colors.white,
                                            fontWeight: FontWeight.bold),
                                      ),
                              )),
                              // Botón cámara superpuesto
                              Positioned(
                                right: 0,
                                bottom: 0,
                                child: GestureDetector(
                                  onTap: _uploadingPhoto ? null : _uploadPhoto,
                                  child: Container(
                                    padding: const EdgeInsets.all(7),
                                    decoration: BoxDecoration(
                                      color: BugieColors.primary,
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                          color: Colors.white, width: 2),
                                    ),
                                    child: _uploadingPhoto
                                        ? const SizedBox(
                                            width: 16, height: 16,
                                            child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                                color: Colors.white),
                                          )
                                        : const Icon(
                                            Icons.camera_alt,
                                            size: 16, color: Colors.white),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Text(_profile?.fullName ?? user?.fullName ?? '',
                              style: const TextStyle(
                                  fontSize: 19, fontWeight: FontWeight.bold)),
                          Text(_profile?.email ?? user?.email ?? '',
                              style: const TextStyle(
                                  color: BugieColors.textMuted)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // ── Info de cuenta ───────────────────────────────────
                    BugieCard(
                      title: 'Información de la cuenta',
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          ListTile(
                            leading: const Icon(Icons.email_outlined),
                            title: const Text('Correo'),
                            subtitle: Text(_profile?.email ?? ''),
                          ),
                          const Divider(height: 1, indent: 70),
                          ListTile(
                            leading: const Icon(Icons.phone_outlined),
                            title: const Text('Teléfono'),
                            subtitle: Text(
                              _profile?.phone.isNotEmpty == true
                                  ? _profile!.phone
                                  : 'No registrado',
                            ),
                          ),
                          const Divider(height: 1, indent: 70),
                          ListTile(
                            leading: Icon(
                              _profile?.isVerified == true
                                  ? Icons.verified
                                  : Icons.pending_outlined,
                              color: _profile?.isVerified == true
                                  ? BugieColors.success
                                  : const Color(0xFFB45309),
                            ),
                            title: const Text('Estado de verificación'),
                            subtitle: Text(
                              _profile?.isVerified == true
                                  ? 'Cuenta verificada'
                                  : 'Pendiente de verificación',
                              style: TextStyle(
                                color: _profile?.isVerified == true
                                    ? BugieColors.success
                                    : const Color(0xFFB45309),
                              ),
                            ),
                          ),
                          const Divider(height: 1, indent: 70),
                          ListTile(
                            leading: const Icon(Icons.calendar_today_outlined),
                            title: const Text('Miembro desde'),
                            subtitle: Text(
                              _profile != null
                                  ? DateFormat('dd MMMM yyyy', 'es_PE')
                                      .format(_profile!.createdAt)
                                  : '',
                            ),
                          ),
                          const Divider(height: 1, indent: 70),
                          ListTile(
                            leading: const Icon(Icons.badge_outlined),
                            title: const Text('Rol'),
                            subtitle: const Text('Pasajero'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // ── Acceso a verificación de DNI ───────────────────
                    BugieCard(
                      padding: EdgeInsets.zero,
                      child: ListTile(
                        leading: const Icon(Icons.fingerprint,
                            color: BugieColors.primary),
                        title: const Text('Documentos de identidad'),
                        subtitle: Text(
                          _profile?.isVerified == true
                              ? 'Ver mis documentos'
                              : 'Sube tu DNI para verificar tu cuenta',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.push('/passenger/verification'),
                      ),
                    ),
                    const SizedBox(height: 20),

                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: BugieColors.danger,
                        side: const BorderSide(color: BugieColors.danger),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      icon: const Icon(Icons.logout),
                      label: const Text('Cerrar sesión'),
                      onPressed: () async {
                        await context.read<Session>().clear();
                        if (context.mounted) context.go('/');
                      },
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
