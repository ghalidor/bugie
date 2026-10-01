import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../auth/data/auth_repository.dart';
import '../../auth/domain/passenger_document_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';

/// Pantalla de verificación de cuenta del pasajero.
/// El pasajero debe subir DNI frontal + reverso. Cuando un admin aprueba ambos,
/// `isVerified` pasa a true y puede solicitar viajes.
///
/// Endpoints usados:
///   GET  /api/auth/users/me/status
///   GET  /api/auth/passengers/documents/me
///   POST /api/auth/passengers/documents (multipart)
class PassengerVerificationScreen extends StatefulWidget {
  const PassengerVerificationScreen({super.key});

  @override
  State<PassengerVerificationScreen> createState() =>
      _PassengerVerificationScreenState();
}

class _DocReq {
  final String key;
  final String label;
  final String description;
  const _DocReq(this.key, this.label, this.description);
}

const _required = [
  _DocReq('dni_front', 'DNI - Frontal', 'Foto clara del frente de tu DNI.'),
  _DocReq('dni_back', 'DNI - Reverso', 'Foto clara del reverso de tu DNI.'),
];

class _PassengerVerificationScreenState
    extends State<PassengerVerificationScreen> {
  UserVerificationStatus? _status;
  List<PassengerDocument> _docs = [];
  bool _loading = true;
  String? _uploading;
  String? _error;
  String? _message;

  final _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final auth = context.read<AuthRepository>();
    try {
      final results = await Future.wait([
        auth.getMyStatus(),
        auth.getMyPassengerDocuments(),
      ]);
      if (!mounted) return;
      setState(() {
        _status = results[0] as UserVerificationStatus;
        _docs = results[1] as List<PassengerDocument>;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'No se pudo cargar la información.';
        });
      }
    }
  }

  Future<void> _upload(_DocReq req) async {
    setState(() { _error = null; _message = null; });

    final source = await _pickSource();
    if (source == null) return;

    final XFile? picked = await _picker.pickImage(
      source: source,
      maxWidth: 2000,
      imageQuality: 85,
    );
    if (picked == null) return;

    setState(() => _uploading = req.key);
    try {
      final saved = await context.read<AuthRepository>().uploadPassengerDocument(
            docType: req.key,
            filePath: picked.path,
          );
      if (!mounted) return;
      setState(() {
        _docs = [..._docs.where((d) => d.docType != req.key), saved];
        _message = 'Documento subido correctamente.';
        _uploading = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _uploading = null; });
    } catch (_) {
      if (mounted) setState(() { _error = 'No se pudo subir el archivo.'; _uploading = null; });
    }
  }

  Future<ImageSource?> _pickSource() async {
    return showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_camera),
                title: const Text('Tomar foto'),
                onTap: () => Navigator.pop(ctx, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library),
                title: const Text('Elegir de galería'),
                onTap: () => Navigator.pop(ctx, ImageSource.gallery),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: const BugieInternalHeader(title: 'Verificación de cuenta'),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final c = context.bugie;
    final isVerified = _status?.isVerified ?? false;
    final allUploaded = _required.every((r) =>
        _docs.any((d) => d.docType == r.key && d.status != 'rejected'));

    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Verificación de cuenta'),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              // Banner principal
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: (isVerified ? BugieColors.success : BugieColors.warning)
                      .withOpacity(0.12),
                  borderRadius: BorderRadius.circular(BugieRadius.md),
                  border: Border.all(
                      color: (isVerified
                              ? BugieColors.success
                              : BugieColors.warning)
                          .withOpacity(0.4)),
                ),
                child: Row(
                  children: [
                    Icon(
                      isVerified ? Icons.check_circle : Icons.access_time,
                      color: isVerified
                          ? BugieColors.success
                          : BugieColors.warning,
                      size: 28,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isVerified
                                ? 'Tu cuenta está activa.'
                                : 'Tu cuenta aún no está verificada.',
                            style: TextStyle(
                                fontWeight: FontWeight.bold, color: c.text),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            isVerified
                                ? 'Ya puedes solicitar viajes.'
                                : allUploaded
                                    ? 'Tus documentos están en revisión.'
                                    : 'Sube los documentos requeridos.',
                            style: TextStyle(fontSize: 12, color: c.textMuted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: BugieColors.danger.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                          color: BugieColors.danger.withOpacity(0.35)),
                    ),
                    child: Text(_error!,
                        style: const TextStyle(color: BugieColors.danger)),
                  ),
                ),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: BugieColors.success.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                          color: BugieColors.success.withOpacity(0.35)),
                    ),
                    child: Text(_message!,
                        style: const TextStyle(color: BugieColors.success)),
                  ),
                ),

              BugieCard(
                title: 'Documentos requeridos',
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (var i = 0; i < _required.length; i++) ...[
                      _DocRow(
                        req: _required[i],
                        doc: _docs
                            .where((d) => d.docType == _required[i].key)
                            .firstOrNull,
                        uploading: _uploading == _required[i].key,
                        onUpload: () => _upload(_required[i]),
                      ),
                      if (i < _required.length - 1)
                        const Divider(height: 1, indent: 70),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),

              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: BugieColors.info.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(BugieRadius.md),
                  border: Border.all(color: BugieColors.info.withOpacity(0.4)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info, color: BugieColors.info),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Una vez aprobados tus documentos, tu cuenta quedará verificada y podrás solicitar viajes.',
                        style: TextStyle(fontSize: 13, color: c.text),
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
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

class _DocRow extends StatelessWidget {
  final _DocReq req;
  final PassengerDocument? doc;
  final bool uploading;
  final VoidCallback onUpload;

  const _DocRow({
    required this.req,
    required this.doc,
    required this.uploading,
    required this.onUpload,
  });

  Color _statusColor(String? s) {
    switch (s) {
      case 'pending':  return Colors.orange;
      case 'approved': return BugieColors.success;
      case 'rejected': return BugieColors.danger;
      default:         return BugieColors.textMuted;
    }
  }

  String _statusLabel(String? s) {
    switch (s) {
      case 'pending':  return 'En revisión';
      case 'approved': return 'Aprobado';
      case 'rejected': return 'Rechazado';
      default:         return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = doc?.status;
    final color = _statusColor(status);

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          CircleAvatar(
            backgroundColor: BugieColors.primary.withOpacity(0.1),
            child: const Icon(Icons.badge, color: BugieColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(req.label,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    ),
                    if (status != null) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: color.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(_statusLabel(status),
                            style: TextStyle(fontSize: 10, color: color)),
                      ),
                    ],
                  ],
                ),
                Text(req.description,
                    style: const TextStyle(
                        fontSize: 12, color: BugieColors.textMuted)),
                if (doc?.status == 'rejected' && doc?.rejectionReason != null) ...[
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      const Icon(Icons.info_outline,
                          size: 12, color: BugieColors.danger),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          'Motivo: ${doc!.rejectionReason}',
                          style: const TextStyle(
                              fontSize: 11, color: BugieColors.danger),
                        ),
                      ),
                    ],
                  ),
                ],
                if (doc?.originalFileName != null) ...[
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      const Icon(Icons.attach_file,
                          size: 12, color: BugieColors.textMuted),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          doc!.originalFileName!,
                          style: const TextStyle(
                              fontSize: 11, color: BugieColors.textMuted),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
            onPressed: uploading ? null : onUpload,
            icon: uploading
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                        color: Colors.white, strokeWidth: 2),
                  )
                : Icon(doc == null ? Icons.upload : Icons.refresh, size: 14),
            label: Text(
              uploading
                  ? 'Subiendo'
                  : doc == null
                      ? 'Subir'
                      : 'Reemplazar',
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}
