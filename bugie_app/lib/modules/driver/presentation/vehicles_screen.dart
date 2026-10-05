import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../data/driver_repository.dart';
import '../domain/vehicle_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';

/// Tipos de foto del vehículo (las tres son obligatorias al registrarlo).
const _photoTypes = <({String type, String label})>[
  (type: 'front', label: 'Frente'),
  (type: 'side',  label: 'Costado'),
  (type: 'plate', label: 'Placa'),
];

/// Pantalla de Vehículos.
/// Muestra el vehículo activo del conductor con sus tres fotos (frente,
/// costado y placa), permite registrar uno nuevo (con sus tres fotos) y
/// permite reemplazar cualquiera de las fotos del activo.
///
/// Endpoints usados:
///   - GET  /api/drivers/vehicles/me                  → vehículo activo
///   - GET  /api/drivers/vehicles/{id}/photos         → sus fotos
///   - POST /api/drivers/vehicles/with-photos         → registrar nuevo + 3 fotos
///   - POST /api/drivers/vehicles/{id}/photos/{type}  → reemplazar una foto
class DriverVehiclesScreen extends StatefulWidget {
  const DriverVehiclesScreen({super.key});

  @override
  State<DriverVehiclesScreen> createState() => _DriverVehiclesScreenState();
}

class _DriverVehiclesScreenState extends State<DriverVehiclesScreen> {
  Vehicle? _vehicle;
  /// Fotos del vehículo activo: tipo ('front' | 'side' | 'plate') -> URL.
  Map<String, String> _photos = {};
  bool _loading = true;
  /// Tipo de foto que se está subiendo (null = ninguna).
  String? _uploadingType;
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
    final repo = context.read<DriverRepository>();
    try {
      final v = await repo.getMyVehicle();
      var photos = <String, String>{};
      if (v != null) {
        try {
          photos = await repo.getVehiclePhotos(v.id);
        } catch (_) {
          // Sin fotos: se muestra la foto de siempre (photoUrl) como frente.
        }
      }
      if (!mounted) return;
      setState(() {
        _vehicle = v;
        _photos = photos;
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
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => const _AddVehicleDialog(),
    );
    if (saved == true && mounted) {
      setState(() => _photoVersion++);
      await _load();
      if (!mounted) return;
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

  /// Pide al usuario una foto (cámara o galería) y reemplaza la de ese tipo.
  Future<void> _uploadPhoto(String type) async {
    final vehicle = _vehicle;
    if (vehicle == null) return;
    final path = await _pickPhoto(context);
    if (path == null || !mounted) return;

    setState(() => _uploadingType = type);
    try {
      final newUrl = await context
          .read<DriverRepository>()
          .uploadVehiclePhoto(vehicle.id, type, path);
      if (!mounted) return;

      if (newUrl.isNotEmpty) {
        setState(() {
          _photos = {..._photos, type: newUrl};
          // Romper el cache de Image.network forzando una URL distinta
          _photoVersion++;
        });
      }

      // Como respaldo, recargar del backend
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
      if (mounted) setState(() => _uploadingType = null);
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
                        photos: _photos,
                        uploadingType: _uploadingType,
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

/// Pregunta de dónde sacar la foto (cámara o galería) y devuelve su ruta.
Future<String?> _pickPhoto(BuildContext context) async {
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
  if (source == null) return null;

  final picked = await ImagePicker().pickImage(
    source: source,
    maxWidth: 1600,
    imageQuality: 85,
  );
  return picked?.path;
}

// ─────────────────────────────────────────────────────────────────────────
// Card del vehículo activo: foto de frente grande + datos + las tres fotos
// (frente, costado, placa) con botón para reemplazar cada una.
// ─────────────────────────────────────────────────────────────────────────

class _VehicleCard extends StatelessWidget {
  final Vehicle vehicle;
  final Map<String, String> photos;
  final String? uploadingType;
  /// Contador que cambia con cada subida exitosa.
  /// Se concatena a la URL como ?v=N para que Image.network NO use cache.
  final int photoVersion;
  final void Function(String type) onUploadPhoto;

  const _VehicleCard({
    required this.vehicle,
    required this.photos,
    required this.uploadingType,
    required this.photoVersion,
    required this.onUploadPhoto,
  });

  /// URL final de la foto de ese tipo (null si no hay). Si no hay registro
  /// de frente (vehículos antiguos), se usa photoUrl.
  /// El backend devuelve URL relativa ("/uploads/..."): resolveMediaUrl le
  /// pone el host del backend con el que ya estamos hablando.
  String? _urlOf(String type) {
    final raw = photos[type] ?? (type == 'front' ? vehicle.photoUrl : null);
    final resolved = ApiConfig.resolveMediaUrl(raw);
    return resolved == null ? null : '$resolved?v=$photoVersion';
  }

  @override
  Widget build(BuildContext context) {
    final frontUrl = _urlOf('front');

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Foto de frente (o placeholder) ───────────────────────────
          AspectRatio(
            aspectRatio: 16 / 9,
            child: _NetPhoto(url: frontUrl),
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

                // ── Las tres fotos, cada una con su botón ───────────────
                const Text('Fotos del vehículo',
                    style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final (i, p) in _photoTypes.indexed) ...[
                      if (i > 0) const SizedBox(width: 8),
                      Expanded(
                        child: _PhotoSlot(
                          label: p.label,
                          url: _urlOf(p.type),
                          uploading: uploadingType == p.type,
                          disabled: uploadingType != null,
                          onTap: () => onUploadPhoto(p.type),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Miniatura de una foto del vehículo con su etiqueta y botón de reemplazo.
class _PhotoSlot extends StatelessWidget {
  final String label;
  final String? url;
  final bool uploading;
  final bool disabled;
  final VoidCallback onTap;

  const _PhotoSlot({
    required this.label,
    required this.url,
    required this.uploading,
    required this.disabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: AspectRatio(
            aspectRatio: 4 / 3,
            child: uploading
                ? const Center(child: CircularProgressIndicator())
                : _NetPhoto(url: url, small: true),
          ),
        ),
        const SizedBox(height: 4),
        Text(label,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        TextButton(
          onPressed: disabled ? null : onTap,
          child: Text(url != null ? 'Reemplazar' : 'Subir',
              style: const TextStyle(fontSize: 12)),
        ),
      ],
    );
  }
}

/// Imagen de red con placeholder si no hay URL o falla la carga.
class _NetPhoto extends StatelessWidget {
  final String? url;
  final bool small;
  const _NetPhoto({required this.url, this.small = false});

  @override
  Widget build(BuildContext context) {
    if (url == null) return _PhotoPlaceholder(small: small);
    return Image.network(
      url!,
      // La key fuerza un widget nuevo cuando cambia la URL (incluye ?v=N).
      key: ValueKey(url),
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => _PhotoPlaceholder(small: small),
      loadingBuilder: (_, child, p) {
        if (p == null) return child;
        return const Center(child: CircularProgressIndicator());
      },
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
  final bool small;
  const _PhotoPlaceholder({this.small = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: context.bugie.surface,
      child: Center(
        child: small
            ? const Icon(Icons.photo_camera_outlined,
                size: 28, color: BugieColors.textMuted)
            : const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.directions_car,
                      size: 60, color: BugieColors.textMuted),
                  SizedBox(height: 6),
                  Text('Sin foto del vehículo',
                      style: TextStyle(
                          color: BugieColors.textMuted, fontSize: 12)),
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
// Dialog para registrar un vehículo nuevo (datos + 3 fotos obligatorias).
// Devuelve true si se guardó.
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
  /// Ruta local de cada foto elegida: tipo -> path.
  final Map<String, String> _photoPaths = {};
  bool _saving = false;
  String? _error;

  Future<void> _pick(String type) async {
    final path = await _pickPhoto(context);
    if (path == null || !mounted) return;
    setState(() { _photoPaths[type] = path; _error = null; });
  }

  Future<void> _save() async {
    if (_plate.text.trim().isEmpty || _brand.text.trim().isEmpty ||
        _model.text.trim().isEmpty || _color.text.trim().isEmpty ||
        int.tryParse(_year.text) == null) {
      setState(() => _error = 'Completa todos los campos.');
      return;
    }
    final missing = _photoTypes
        .where((p) => _photoPaths[p.type] == null)
        .map((p) => p.label.toLowerCase())
        .toList();
    if (missing.isNotEmpty) {
      setState(() => _error = 'Faltan las fotos: ${missing.join(', ')}.');
      return;
    }

    setState(() { _saving = true; _error = null; });
    try {
      await context.read<DriverRepository>().addVehicleWithPhotos(
        plate: _plate.text.trim(),
        brand: _brand.text.trim(),
        model: _model.text.trim(),
        year: int.parse(_year.text),
        color: _color.text.trim(),
        frontPath: _photoPaths['front']!,
        sidePath: _photoPaths['side']!,
        platePath: _photoPaths['plate']!,
      );
      if (mounted) Navigator.pop(context, true);
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
            const SizedBox(height: 16),
            const Text('Fotos (obligatorias)',
                style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            for (final p in _photoTypes)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: Icon(
                  _photoPaths[p.type] != null
                      ? Icons.check_circle
                      : Icons.add_a_photo_outlined,
                  color: _photoPaths[p.type] != null
                      ? BugieColors.success
                      : BugieColors.textMuted,
                ),
                title: Text(p.label),
                subtitle: Text(
                  _photoPaths[p.type] != null ? 'Foto lista' : 'Sin foto',
                  style: const TextStyle(fontSize: 12),
                ),
                trailing: TextButton(
                  onPressed: _saving ? null : () => _pick(p.type),
                  child: Text(_photoPaths[p.type] != null ? 'Cambiar' : 'Elegir'),
                ),
              ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: const TextStyle(color: BugieColors.danger)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
            onPressed: _saving ? null : () => Navigator.pop(context),
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
