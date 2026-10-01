import 'dart:io';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../presence/data/presence_repository.dart';
import '../../presence/domain/presence_check_in_model.dart';
import '../../presence/presentation/face_capture_screen.dart';
import '../data/driver_repository.dart';
import '../domain/driver_model.dart';

/// Pantalla de "Disponibilidad" del conductor.
///
/// Flujo:
///   OFFLINE -> presionar "Conectarme"
///           -> abre FaceCaptureScreen (selfie + ML Kit)
///           -> si la captura es OK, sube la foto al backend (check-in)
///           -> llama a goOnline(lat, lng)
///           -> queda ONLINE con la foto como preview en pantalla.
///   ONLINE  -> presionar "Desconectarme"
///           -> llama a goOffline()
///           -> cierra el check-in en backend
///           -> vuelve a OFFLINE (preview de la foto se borra).
///
/// La foto solo se mantiene en pantalla mientras la sesion este activa.
/// Si la app se cierra y se reabre estando online, recuperamos el check-in
/// activo del backend para mostrar la foto sin pedir tomarla de nuevo.
class GoOnlineScreen extends StatefulWidget {
  const GoOnlineScreen({super.key});

  @override
  State<GoOnlineScreen> createState() => _GoOnlineScreenState();
}

class _GoOnlineScreenState extends State<GoOnlineScreen> {
  Driver? _driver;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  /// Check-in activo. Si no es null, dibujamos el preview de la foto.
  PresenceCheckIn? _activeCheckIn;

  /// Path local de la foto recien capturada (mas rapido que ir al server).
  String? _localPhotoPath;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      var d = await context.read<DriverRepository>().getMyProfile();
      d ??= await context.read<DriverRepository>().registerProfile();

      // Si el conductor esta online, restauramos el check-in activo para
      // mostrar la foto de cuando se conecto (no pedirla de nuevo).
      PresenceCheckIn? active;
      if (d.isOnline) {
        try {
          active = await context.read<PresenceRepository>().getActive();
        } catch (_) {
          // Sin red, seguimos sin preview -- no es bloqueante.
        }
      }

      if (mounted) {
        setState(() {
          _driver = d;
          _activeCheckIn = active;
          _loading = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'No se pudo cargar.'; _loading = false; });
    }
  }

  Future<void> _toggle() async {
    if (_driver == null) return;
    if (_driver!.isOnline) {
      await _goOffline();
    } else {
      await _goOnline();
    }
  }

  Future<void> _goOnline() async {
    setState(() { _busy = true; _error = null; });
    try {
      // PASO 1: cara
      final result = await Navigator.of(context).push<FaceCaptureResult>(
        MaterialPageRoute(builder: (_) => const FaceCaptureScreen()),
      );
      if (result == null) {
        if (mounted) setState(() => _busy = false);
        return;
      }

      // PASO 2: upload
      final presence = context.read<PresenceRepository>();
      final checkIn = await presence.checkIn(
        filePath: result.filePath,
        faceQualityScore: result.qualityScore,
      );

      // PASO 3: GPS + goOnline
      double lat = -8.109052, lng = -79.021534;
      try {
        final perm = await Geolocator.checkPermission();
        if (perm == LocationPermission.denied) {
          await Geolocator.requestPermission();
        }
        final pos = await Geolocator.getCurrentPosition();
        lat = pos.latitude;
        lng = pos.longitude;
      } catch (_) {}

      final repo = context.read<DriverRepository>();
      final updated = await repo.goOnline(lat, lng);

      final tracking = context.read<LocationTrackingService>();
      if (tracking.isRunning) tracking.stop();

      if (mounted) {
        setState(() {
          _driver = updated;
          _activeCheckIn = checkIn;
          _localPhotoPath = result.filePath;
          _busy = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _busy = false; });
    } catch (e) {
      if (mounted) setState(() {
        _error = 'No se pudo conectar. Intenta de nuevo.';
        _busy = false;
      });
    }
  }

  Future<void> _goOffline() async {
    setState(() { _busy = true; _error = null; });
    try {
      final repo = context.read<DriverRepository>();
      final presence = context.read<PresenceRepository>();
      final tracking = context.read<LocationTrackingService>();

      final updated = await repo.goOffline();
      tracking.stop();
      try { await presence.checkOut(); } catch (_) {}

      if (mounted) {
        setState(() {
          _driver = updated;
          _activeCheckIn = null;
          _localPhotoPath = null;
          _busy = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _busy = false; });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'No se pudo desconectar. Intenta de nuevo.';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: const BugieInternalHeader(title: 'Disponibilidad'),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final approved = _driver?.status == DriverStatus.approved;
    final isOnline = _driver?.isOnline == true;

    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Disponibilidad'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 12),
              Center(
                child: Icon(
                  isOnline ? Icons.power_settings_new : Icons.power_off,
                  size: 72,
                  color: isOnline ? BugieColors.success : BugieColors.textMuted,
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  isOnline ? 'Estas EN LINEA' : 'Estas OFFLINE',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  isOnline
                      ? 'Recibes solicitudes de viaje. Manten el GPS activo.'
                      : 'No recibes solicitudes. Toma tu selfie de verificacion para conectarte.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: BugieColors.textMuted),
                ),
              ),
              const SizedBox(height: 20),

              if (isOnline && (_activeCheckIn != null || _localPhotoPath != null))
                _buildPhotoPreview(),

              if (!approved) ...[
                const SizedBox(height: 8),
                Card(
                  color: Colors.amber.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      'Tu cuenta esta en estado: ${DriverStatus.label(_driver!.status)}. No puedes conectarte hasta ser aprobado.',
                      style: const TextStyle(color: Colors.brown),
                    ),
                  ),
                ),
              ],

              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: Colors.red, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(_error!,
                            style: const TextStyle(color: BugieColors.danger)),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 32),

              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: isOnline ? BugieColors.danger : BugieColors.success,
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: _busy
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Icon(isOnline ? Icons.power_off : Icons.camera_alt, color: Colors.white),
                label: Text(
                  _busy
                      ? 'Procesando...'
                      : (isOnline ? 'Desconectarme' : 'Tomar foto y conectarme'),
                  style: const TextStyle(
                      fontSize: 16, color: Colors.white, fontWeight: FontWeight.bold),
                ),
                onPressed: (!approved || _busy) ? null : _toggle,
              ),
              const SizedBox(height: 12),

              if (!isOnline && approved)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: BugieColors.primary.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, color: BugieColors.primary, size: 18),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Verificacion facial requerida para activar tu disponibilidad.',
                          style: TextStyle(fontSize: 12, color: BugieColors.primary),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPhotoPreview() {
    Widget image;
    if (_localPhotoPath != null) {
      image = Image.file(
        File(_localPhotoPath!),
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildPhotoFromUrl(),
      );
    } else {
      image = _buildPhotoFromUrl();
    }

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            border: Border.all(color: BugieColors.success, width: 3),
            borderRadius: BorderRadius.circular(80),
          ),
          child: ClipOval(
            child: SizedBox(width: 140, height: 140, child: image),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.verified, color: BugieColors.success, size: 16),
            const SizedBox(width: 6),
            Text(
              'Verificado en esta sesion',
              style: TextStyle(
                fontSize: 12,
                color: BugieColors.success,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildPhotoFromUrl() {
    if (_activeCheckIn == null) {
      return Container(
        color: Colors.grey.shade200,
        child: const Icon(Icons.person, size: 64, color: Colors.grey),
      );
    }
    final base = ApiConfig.drivers.replaceAll(RegExp(r'/api/?$'), '');
    final url = '$base${_activeCheckIn!.photoUrl}';
    return Image.network(
      url,
      fit: BoxFit.cover,
      loadingBuilder: (_, child, progress) {
        if (progress == null) return child;
        return const Center(child: CircularProgressIndicator(strokeWidth: 2));
      },
      errorBuilder: (_, __, ___) => Container(
        color: Colors.grey.shade200,
        child: const Icon(Icons.person, size: 64, color: Colors.grey),
      ),
    );
  }
}
