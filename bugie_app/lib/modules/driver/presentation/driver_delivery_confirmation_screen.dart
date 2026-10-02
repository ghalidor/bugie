import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../trips/data/trips_repository.dart';

/// Confirmacion de la entrega en destino (solo envios).
/// El conductor toma la foto de la entrega y escribe quien recibio el paquete.
/// Sin esto no se puede completar el envio. Devuelve true si se confirmo.
class DriverDeliveryConfirmationScreen extends StatefulWidget {
  final String tripId;
  /// Nombre del destinatario que puso el pasajero (se propone por defecto).
  final String? recipientName;
  const DriverDeliveryConfirmationScreen({
    super.key,
    required this.tripId,
    this.recipientName,
  });

  @override
  State<DriverDeliveryConfirmationScreen> createState() =>
      _DriverDeliveryConfirmationScreenState();
}

class _DriverDeliveryConfirmationScreenState
    extends State<DriverDeliveryConfirmationScreen> {
  XFile? _photo;
  late final TextEditingController _byCtrl =
      TextEditingController(text: widget.recipientName ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _byCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final img = await ImagePicker()
        .pickImage(source: ImageSource.camera, imageQuality: 70);
    if (img != null) setState(() => _photo = img);
  }

  Future<void> _submit() async {
    if (_photo == null) {
      setState(() => _error = 'Toma la foto de la entrega.');
      return;
    }
    if (_byCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Escribe quién recibió el envío.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<TripsRepository>().uploadDeliveryConfirmation(
            widget.tripId,
            photoPath: _photo!.path,
            receivedBy: _byCtrl.text.trim(),
          );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No se pudo confirmar la entrega.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: const BugieInternalHeader(title: 'Confirmar entrega'),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Entrega en destino', style: BugieText.h3.copyWith(color: c.text)),
            const SizedBox(height: 4),
            Text(
              'Toma una foto del paquete entregado y escribe quién lo recibió. '
              'Esto queda como constancia del envío.',
              style: TextStyle(color: c.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 16),
            Text('Foto de la entrega', style: BugieText.label.copyWith(color: c.text)),
            const SizedBox(height: 8),
            InkWell(
              onTap: _pickPhoto,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                height: 180,
                decoration: BoxDecoration(
                  color: c.inputFill,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: c.inputBorder),
                  image: _photo != null
                      ? DecorationImage(image: FileImage(File(_photo!.path)), fit: BoxFit.cover)
                      : null,
                ),
                child: _photo == null
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
            ),
            const SizedBox(height: 16),
            Text('¿Quién lo recibió?', style: BugieText.label.copyWith(color: c.text)),
            const SizedBox(height: 8),
            TextField(
              controller: _byCtrl,
              maxLength: 120,
              decoration: const InputDecoration(hintText: 'Nombre de quien recibe'),
            ),
            const SizedBox(height: 12),
            if (_error != null) ...[
              Text(_error!, style: const TextStyle(color: BugieColors.danger)),
              const SizedBox(height: 12),
            ],
            BugieButtons.primary(
              text: _busy ? 'Enviando...' : 'Confirmar entrega',
              loading: _busy,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
