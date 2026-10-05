import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../emergency_contact/presentation/emergency_contact_card.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../auth/data/auth_repository.dart';
import '../../auth/domain/user_model.dart';
import '../../auth/presentation/widgets/identity_info_card.dart';
import '../../passenger/presentation/home_shared.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/trip_model.dart';
import '../data/driver_repository.dart';
import '../domain/driver_model.dart';

class DriverProfileScreen extends StatefulWidget {
  const DriverProfileScreen({super.key});

  @override
  State<DriverProfileScreen> createState() => _DriverProfileScreenState();
}

class _DriverProfileScreenState extends State<DriverProfileScreen> {
  Driver? _driver;
  /// Datos de identidad (GET /api/auth/me): nombres, apellidos y documento.
  UserProfile? _user;
  /// Cantidad de viajes COMPLETADOS (status=4) del conductor.
  /// Se calcula en el cliente porque el backend Drivers no expone este dato
  /// (vive en el módulo Trips). Solo se carga al entrar a esta pantalla.
  int _completedTripsCount = 0;
  bool _loading = true;
  bool _uploadingPhoto = false;
  /// Versión de la foto: se incrementa al subir nueva para forzar a
  /// Image.network a no usar el caché de la URL anterior.
  int _photoVersion = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final dRepo = context.read<DriverRepository>();
      final tRepo = context.read<TripsRepository>();
      final aRepo = context.read<AuthRepository>();
      // En paralelo: perfil + historial. Si historial falla, dejamos 0.
      final results = await Future.wait([
        dRepo.getMyProfile(),
        tRepo.getHistory().catchError((_) => <Trip>[]),
        aRepo.getMyProfile().then<UserProfile?>((p) => p, onError: (_) => null),
      ]);
      if (!mounted) return;
      final driver = results[0] as Driver?;
      final history = results[1] as List<Trip>;
      setState(() {
        _driver = driver;
        _user = results[2] as UserProfile?;
        _completedTripsCount =
            history.where((t) => t.status == TripStatus.completed).length;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Subida de foto de perfil. Endpoint dedicado del módulo Drivers:
  /// POST /api/drivers/profile/me/photo. La foto se guarda en
  /// drivers.Drivers.ProfilePhotoUrl (no en auth.Users).
  Future<void> _uploadPhoto() async {
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
      final newUrl = await context
          .read<DriverRepository>()
          .uploadMyProfilePhoto(picked.path);
      if (!mounted) return;

      // Actualizar state local sin esperar al GET.
      if (_driver != null && newUrl.isNotEmpty) {
        setState(() {
          _driver = Driver(
            id:               _driver!.id,
            userId:           _driver!.userId,
            status:           _driver!.status,
            isOnline:         _driver!.isOnline,
            rating:           _driver!.rating,
            profilePhotoUrl:  newUrl,
            createdAt:        _driver!.createdAt,
          );
          _photoVersion++;
        });
      }

      // Actualiza el avatar compartido (inicio + cuenta) al instante.
      if (newUrl.isNotEmpty) {
        final resolved =
            ApiConfig.resolveMediaUrl(newUrl, service: ApiService.drivers);
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
    // La foto del conductor viene de Drivers API. Por eso usamos
    // ApiService.drivers (que es el default) para resolver la URL.
    final resolved = ApiConfig.resolveMediaUrl(_driver?.profilePhotoUrl);
    final hasPhoto = resolved != null;
    // Cache-busting: la URL no cambia al reemplazar la foto en el mismo path,
    // así que le pegamos un query param para forzar redescarga.
    final photoUrlWithCache =
        hasPhoto ? '$resolved?v=$_photoVersion' : null;

    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Mi perfil'),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [
                    // ── Avatar con botón cámara + nombre + email ─────────
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
                                              : 'C',
                                          style: const TextStyle(
                                              fontSize: 36,
                                              color: Colors.white,
                                              fontWeight: FontWeight.bold),
                                        ),
                                ),
                              ),
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
                          Text(user?.fullName ?? '',
                              style: const TextStyle(
                                  fontSize: 19, fontWeight: FontWeight.bold)),
                          Text(user?.email ?? '',
                              style: const TextStyle(
                                  color: BugieColors.textMuted)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // ── Datos personales (solo lectura) ──────────────────
                    IdentityInfoCard(profile: _user),
                    const SizedBox(height: 16),

                    // ── Info del conductor ───────────────────────────────
                    BugieCard(
                      title: 'Información del conductor',
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          ListTile(
                            leading: const Icon(Icons.email_outlined),
                            title: const Text('Correo'),
                            subtitle: Text(user?.email ?? ''),
                          ),
                          const Divider(height: 1, indent: 70),
                          ListTile(
                            leading: Icon(
                              Icons.verified_user,
                              color: _driver?.status == DriverStatus.approved
                                  ? BugieColors.success
                                  : null,
                            ),
                            title: const Text('Estado de cuenta'),
                            subtitle: Text(
                              _driver != null
                                  ? DriverStatus.label(_driver!.status)
                                  : 'Sin perfil',
                              style: TextStyle(
                                color: _driver?.status == DriverStatus.approved
                                    ? BugieColors.success
                                    : null,
                              ),
                            ),
                          ),
                          const Divider(height: 1, indent: 70),
                          ListTile(
                            leading: Icon(
                              Icons.power_settings_new,
                              color: _driver?.isOnline == true
                                  ? BugieColors.success
                                  : null,
                            ),
                            title: const Text('En línea'),
                            subtitle: Text(
                              _driver?.isOnline == true ? 'Sí' : 'No',
                              style: TextStyle(
                                color: _driver?.isOnline == true
                                    ? BugieColors.success
                                    : null,
                              ),
                            ),
                          ),
                          const Divider(height: 1, indent: 70),
                          ListTile(
                            leading: const Icon(Icons.history),
                            title: const Text('Viajes totales'),
                            subtitle: Text('$_completedTripsCount'),
                          ),
                          const Divider(height: 1, indent: 70),
                          ListTile(
                            leading: const Icon(Icons.badge_outlined),
                            title: const Text('Rol'),
                            subtitle: const Text('Conductor'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ── Accesos rápidos ──────────────────────────────────
                    BugieCard(
                      title: 'Documentación',
                      padding: EdgeInsets.zero,
                      child: ListTile(
                        leading: const Icon(Icons.folder_outlined,
                            color: BugieColors.primary),
                        title: const Text('Mis documentos'),
                        subtitle: const Text(
                            'DNI, licencia, antecedentes, SOAT'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.push('/driver/documents'),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ── Contacto de emergencia (recomendado) ─────────────
                    const EmergencyContactCard(),
                    const SizedBox(height: 16),

                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: BugieColors.danger,
                        side: const BorderSide(color: BugieColors.danger),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      icon: const Icon(Icons.logout),
                      label: const Text('Cerrar sesión'),
                      onPressed: () async {
                        await context.read<AuthRepository>().logout();
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
