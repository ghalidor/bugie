import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../trips/data/trips_repository.dart';

/// Verificacion del paquete al recoger (solo envios).
/// El conductor toma la foto principal (paquete con el cliente) + fotos
/// secundarias (opcionales) + observacion, y se suben al backend. Al terminar,
/// habilita "Paquete a bordo" (Start). Devuelve true si la verificacion se subio.
class DriverPickupVerificationScreen extends StatefulWidget {
  final String tripId;
  const DriverPickupVerificationScreen({super.key, required this.tripId});

  @override
  State<DriverPickupVerificationScreen> createState() =>
      _DriverPickupVerificationScreenState();
}

class _DriverPickupVerificationScreenState
    extends State<DriverPickupVerificationScreen> {
  XFile? _main;
  final List<XFile> _secondary = [];
  final _obsCtrl = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _obsCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickMain() async {
    final img = await ImagePicker()
        .pickImage(source: ImageSource.camera, imageQuality: 70);
    if (img != null) setState(() => _main = img);
  }

  Future<void> _pickSecondary() async {
    final imgs = await ImagePicker().pickMultiImage(imageQuality: 70);
    if (imgs.isNotEmpty) setState(() => _secondary.addAll(imgs));
  }

  Future<void> _submit() async {
    if (_main == null) {
      setState(() => _error = 'Toma la foto principal del paquete con el cliente.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<TripsRepository>().uploadPickupVerification(
            widget.tripId,
            mainPath: _main!.path,
            secondaryPaths: _secondary.map((x) => x.path).toList(),
            observation: _obsCtrl.text.trim().isEmpty ? null : _obsCtrl.text.trim(),
          );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No se pudo subir la verificacion.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: const BugieInternalHeader(title: 'Verificar paquete'),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Antes de recibir el paquete',
                style: BugieText.h3.copyWith(color: c.text)),
            const SizedBox(height: 4),
            Text(
              'Toma una foto del paquete junto al cliente. Puedes agregar fotos '
              'adicionales y una observacion. Esto queda como respaldo.',
              style: TextStyle(color: c.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 16),

            // Foto principal
            Text('Foto principal (con el cliente)',
                style: BugieText.label.copyWith(color: c.text)),
            const SizedBox(height: 8),
            _MainPhoto(main: _main, onTap: _pickMain, c: c),
            const SizedBox(height: 16),

            // Fotos secundarias
            Text('Fotos adicionales (opcional)',
                style: BugieText.label.copyWith(color: c.text)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (int i = 0; i < _secondary.length; i++)
                  _Thumb(
                    path: _secondary[i].path,
                    onRemove: () => setState(() => _secondary.removeAt(i)),
                  ),
                InkWell(
                  onTap: _pickSecondary,
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: c.inputFill,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: c.inputBorder),
                    ),
                    child: Icon(Icons.add_a_photo_outlined, color: c.textMuted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Observacion
            Text('Observacion (opcional)',
                style: BugieText.label.copyWith(color: c.text)),
            const SizedBox(height: 8),
            TextField(
              controller: _obsCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                  hintText: 'Estado del paquete, detalles, etc.'),
            ),
            const SizedBox(height: 20),

            if (_error != null) ...[
              Text(_error!, style: const TextStyle(color: BugieColors.danger)),
              const SizedBox(height: 12),
            ],

            BugieButtons.primary(
              text: _busy ? 'Subiendo...' : 'Confirmar y recibir paquete',
              loading: _busy,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class _MainPhoto extends StatelessWidget {
  final XFile? main;
  final VoidCallback onTap;
  final BugieColorsExt c;
  const _MainPhoto({required this.main, required this.onTap, required this.c});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        height: 180,
        decoration: BoxDecoration(
          color: c.inputFill,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: c.inputBorder),
          image: main != null
              ? DecorationImage(
                  image: FileImage(File(main!.path)), fit: BoxFit.cover)
              : null,
        ),
        child: main == null
            ? Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.camera_alt_outlined, color: c.textMuted, size: 34),
                  const SizedBox(height: 8),
                  Text('Tomar foto', style: TextStyle(color: c.textMuted)),
                ],
              )
            : null,
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  final String path;
  final VoidCallback onRemove;
  const _Thumb({required this.path, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.file(File(path), width: 72, height: 72, fit: BoxFit.cover),
        ),
        Positioned(
          top: -8,
          right: -8,
          child: GestureDetector(
            onTap: onRemove,
            child: const CircleAvatar(
              radius: 11,
              backgroundColor: Colors.red,
              child: Icon(Icons.close, size: 14, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}
