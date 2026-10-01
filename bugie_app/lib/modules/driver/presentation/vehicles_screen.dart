import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../data/driver_repository.dart';
import '../domain/vehicle_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';

/// Pantalla de Vehículos.
/// Muestra el vehículo activo del conductor (con su foto si la tiene),
/// permite registrar uno nuevo, y permite subir/cambiar la foto del activo.
///
/// Endpoints usados:
///   - GET  /api/drivers/vehicles/me           → vehículo activo
///   - POST /api/drivers/vehicles              → registrar nuevo
///   - POST /api/drivers/vehicles/me/photo     → subir foto
class DriverVehiclesScreen extends StatefulWidget {
  const DriverVehiclesScreen({super.key});

  @override
  State<DriverVehiclesScreen> createState() => _DriverVehiclesScreenState();
}

class _DriverVehiclesScreenState extends State<DriverVehiclesScreen> {
  Vehicle? _vehicle;
  bool _loading = true;
  bool _uploadingPhoto = false;
  String? _error;
  /// Contador que se incrementa cada vez que se sube una foto nueva.
  /// Se concatena a la URL como ?v=N para forzar a Flutter a recargar
  /// la imagen y no mostrar la versión cacheada anterior.
  int _photoVersion = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final v = await context.read<DriverRepository>().getMyVehicle();
      if (!mounted) return;
      setState(() {
        _vehicle = v;
        _loading = false;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.message; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'No se pudo cargar el vehículo.'; });
    }
  }

  Future<void> _addVehicle() async {
    final result = await showDialog<Vehicle>(
      context: context,
      builder: (_) => const _AddVehicleDialog(),
    );
    if (result != null && mounted) {
      setState(() => _vehicle = result);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.check_circle, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Expanded(child: Text('Vehículo registrado')),
            ],
          ),
          backgroundColor: BugieColors.success,
          duration: Duration(seconds: 3),
        ),
      );
    }
  }

  /// Pide al usuario una foto (cámara o galería) y la sube al backend.
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
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    setState(() => _uploadingPhoto = true);
    try {
      // El POST devuelve la nueva URL. La usamos directamente para actualizar
      // el state local — evita depender de un GET posterior que podría no
      // reflejar el cambio inmediatamente (latencia, replicación, etc).
      final newUrl = await context
          .read<DriverRepository>()
          .uploadMyVehiclePhoto(picked.path);
      if (!mounted) return;

      // Actualizar el state local con la nueva URL
      if (_vehicle != null && newUrl.isNotEmpty) {
        setState(() {
          _vehicle = Vehicle(
            id:       _vehicle!.id,
            driverId: _vehicle!.driverId,
            plate:    _vehicle!.plate,
            brand:    _vehicle!.brand,
            model:    _vehicle!.model,
            year:     _vehicle!.year,
            color:    _vehicle!.color,
            isActive: _vehicle!.isActive,
            photoUrl: newUrl,
          );
          // Romper el cache de Image.network forzando una URL distinta
          _photoVersion++;
        });
      }

      // Como respaldo, recargar del backend por si hay otros campos que cambien
      await _load();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
          content: Row(
            children: [
              Icon(Icons.check_circle, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Expanded(child: Text('Foto del vehículo actualizada')),
            ],
          ),
          backgroundColor: BugieColors.success,
          duration: Duration(seconds: 3),
        ),
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
    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Vehículos'),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [
                    if (_error != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: BugieColors.danger.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(_error!,
                            style: const TextStyle(color: BugieColors.danger)),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Mensaje informativo (siempre visible) — adaptativo al tema
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: BugieColors.info.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color: BugieColors.info.withOpacity(0.4)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.info, color: BugieColors.info),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Solo puedes tener un vehículo activo a la vez. Al registrar otro, el anterior queda inactivo.',
                              style: TextStyle(
                                  fontSize: 13, color: context.bugie.text),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Card del vehículo activo (si lo tiene)
                    if (_vehicle != null) ...[
                      _VehicleCard(
                        vehicle: _vehicle!,
                        uploadingPhoto: _uploadingPhoto,
                        photoVersion: _photoVersion,
                        onUploadPhoto: _uploadPhoto,
                      ),
                      const SizedBox(height: 16),
                      // Botón secundario: cambiar de vehículo (registrar otro)
                      OutlinedButton.icon(
                        onPressed: _addVehicle,
                        icon: const Icon(Icons.swap_horiz),
                        label: const Text('Registrar otro vehículo'),
                      ),
                    ] else
                      _EmptyState(onAdd: _addVehicle),
                  ],
                ),
              ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Card del vehículo activo con foto + datos + botón para cambiar foto.
// ─────────────────────────────────────────────────────────────────────────

class _VehicleCard extends StatelessWidget {
  final Vehicle vehicle;
  final bool uploadingPhoto;
  /// Contador que cambia con cada subida exitosa.
  /// Se concatena a la URL como ?v=N para que Image.network NO use cache.
  final int photoVersion;
  final VoidCallback onUploadPhoto;

  const _VehicleCard({
    required this.vehicle,
    required this.uploadingPhoto,
    required this.photoVersion,
    required this.onUploadPhoto,
  });

  @override
  Widget build(BuildContext context) {
    // El backend puede devolver:
    //   - URL relativa: "/uploads/vehicles/{driverId}/xxxx.jpg" (caso actual)
    //   - URL absoluta: "http://..." (cuando se sirve desde Drive u otro storage)
    // El helper resolveMediaUrl arma la URL final correcta usando el host del
    // backend con el que ya estamos hablando, sin depender de PublicBaseUrl
    // del appsettings que puede tener "localhost" y no funcionar en celular.
    final resolved = ApiConfig.resolveMediaUrl(vehicle.photoUrl);
    final hasPhoto = resolved != null;

    // Cache-buster: ?v=<photoVersion>. El número aumenta cada vez que se
    // sube una foto nueva, así Flutter pide la imagen al servidor en lugar
    // de mostrar la versión cacheada en memoria/disco.
    final photoUrl = hasPhoto ? '$resolved?v=$photoVersion' : null;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Foto del vehículo (si la tiene) o placeholder ─────────────
          AspectRatio(
            aspectRatio: 16 / 9,
            child: photoUrl != null
                ? Image.network(
                    photoUrl,
                    // La key fuerza la creación de un widget nuevo cuando
                    // cambia la URL (incluyendo el ?v=N).
                    key: ValueKey(photoUrl),
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _PhotoPlaceholder(),
                    loadingBuilder: (_, child, p) {
                      if (p == null) return child;
                      return const Center(child: CircularProgressIndicator());
                    },
                  )
                : _PhotoPlaceholder(),
          ),

          // ── Datos del vehículo ────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${vehicle.brand} ${vehicle.model}',
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                    ),
                    if (vehicle.isActive)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: BugieColors.success.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text(
                          'Activo',
                          style: TextStyle(
                            color: BugieColors.success,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                _InfoRow(label: 'Placa',  value: vehicle.plate),
                _InfoRow(label: 'Año',    value: vehicle.year.toString()),
                _InfoRow(label: 'Color',  value: vehicle.color),
                const SizedBox(height: 14),

                // Botón para subir/cambiar foto
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: uploadingPhoto ? null : onUploadPhoto,
                    icon: uploadingPhoto
                        ? const SizedBox(
                            width: 16, height: 16,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2),
                          )
                        : Icon(hasPhoto ? Icons.edit : Icons.add_a_photo),
                    label: Text(
                      uploadingPhoto
                          ? 'Subiendo...'
                          : hasPhoto
                              ? 'Cambiar foto'
                              : 'Subir foto del vehículo',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 60,
            child: Text(label,
                style: const TextStyle(
                    color: BugieColors.textMuted, fontSize: 13)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}

class _PhotoPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      color: context.bugie.surface,
      child: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.directions_car,
                size: 60, color: BugieColors.textMuted),
            SizedBox(height: 6),
            Text('Sin foto del vehículo',
                style: TextStyle(color: BugieColors.textMuted, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Estado vacío: el conductor todavía no tiene vehículo
// ─────────────────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final VoidCallback onAdd;
  const _EmptyState({required this.onAdd});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 32),
        const Icon(Icons.directions_car_outlined,
            size: 80, color: BugieColors.textMuted),
        const SizedBox(height: 12),
        const Text(
          'Todavía no tienes un vehículo registrado',
          style: TextStyle(fontSize: 16),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 6),
        const Text(
          'Regístralo para poder recibir solicitudes de viaje.',
          style: TextStyle(color: BugieColors.textMuted, fontSize: 13),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        ElevatedButton.icon(
          icon: const Icon(Icons.add),
          label: const Text('Registrar vehículo'),
          onPressed: onAdd,
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Dialog para registrar un vehículo nuevo
// ─────────────────────────────────────────────────────────────────────────

class _AddVehicleDialog extends StatefulWidget {
  const _AddVehicleDialog();

  @override
  State<_AddVehicleDialog> createState() => _AddVehicleDialogState();
}

class _AddVehicleDialogState extends State<_AddVehicleDialog> {
  final _plate = TextEditingController();
  final _brand = TextEditingController();
  final _model = TextEditingController();
  final _year  = TextEditingController(text: '2020');
  final _color = TextEditingController();
  bool _saving = false;
  String? _error;

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; });
    try {
      final v = await context.read<DriverRepository>().addVehicle(
        plate: _plate.text.trim(),
        brand: _brand.text.trim(),
        model: _model.text.trim(),
        year: int.tryParse(_year.text) ?? 2020,
        color: _color.text.trim(),
      );
      if (mounted) Navigator.pop(context, v);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo guardar.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _plate.dispose(); _brand.dispose(); _model.dispose();
    _year.dispose();  _color.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Nuevo vehículo'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _plate,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                  labelText: 'Placa', hintText: 'ABC-123'),
            ),
            const SizedBox(height: 8),
            TextField(controller: _brand,
                decoration: const InputDecoration(labelText: 'Marca')),
            const SizedBox(height: 8),
            TextField(controller: _model,
                decoration: const InputDecoration(labelText: 'Modelo')),
            const SizedBox(height: 8),
            TextField(
              controller: _year,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Año'),
            ),
            const SizedBox(height: 8),
            TextField(controller: _color,
                decoration: const InputDecoration(labelText: 'Color')),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: const TextStyle(color: BugieColors.danger)),
            ],
            const SizedBox(height: 12),
            const Text(
              'Después de registrar podrás subir la foto del vehículo.',
              style: TextStyle(color: BugieColors.textMuted, fontSize: 12),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar')),
        ElevatedButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(
                      color: Colors.white, strokeWidth: 2))
              : const Text('Guardar'),
        ),
      ],
    );
  }
}
