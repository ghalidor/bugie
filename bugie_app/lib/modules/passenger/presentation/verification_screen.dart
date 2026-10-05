import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../auth/data/auth_repository.dart';
import '../../auth/domain/passenger_document_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';

/// Pantalla de verificación de cuenta del pasajero.
/// El pasajero debe subir DNI frontal + reverso y tener foto de perfil.
/// Cuando un admin aprueba, `isVerified` pasa a true y puede solicitar viajes.
///
/// La lista de requisitos y su estado la da el backend:
///   GET  /api/auth/passengers/documents/me/requirements
///   GET  /api/auth/passengers/documents/me (nombre del archivo subido)
///   POST /api/auth/passengers/documents (multipart, DNI)
///   POST /api/auth/me/profile-photo (multipart, foto de perfil: mismo flujo
///        que en "Mis datos")
class PassengerVerificationScreen extends StatefulWidget {
  const PassengerVerificationScreen({super.key});

  @override
  State<PassengerVerificationScreen> createState() =>
      _PassengerVerificationScreenState();
}

/// Descripción de cada requisito (el nombre lo manda el backend).
String _reqDescription(String key) {
  switch (key) {
    case 'dni_front':     return 'Foto clara del frente de tu DNI.';
    case 'dni_back':      return 'Foto clara del reverso de tu DNI.';
    case 'profile_photo': return 'Una foto tuya de frente, con buena luz.';
    default:              return '';
  }
}

class _PassengerVerificationScreenState
    extends State<PassengerVerificationScreen> {
  PassengerRequirements? _reqs;
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
        auth.getMyPassengerRequirements(),
        auth.getMyPassengerDocuments(),
      ]);
      if (!mounted) return;
      setState(() {
        _reqs = results[0] as PassengerRequirements;
        _docs = results[1] as List<PassengerDocument>;
        _loading = false;
        _error = null;
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

  Future<void> _upload(PassengerRequirement req) async {
    setState(() { _error = null; _message = null; });

    final source = await _pickSource();
    if (source == null) return;

    final XFile? picked = await _picker.pickImage(
      source: source,
      maxWidth: 2000,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    setState(() => _uploading = req.key);
    try {
      final repo = context.read<AuthRepository>();
      if (req.key == 'profile_photo') {
        // Mismo endpoint que el de "Mis datos": actualiza también el avatar.
        final newUrl = await repo.uploadProfilePhoto(picked.path);
        if (!mounted) return;
        if (newUrl.isNotEmpty) {
          final resolved =
              ApiConfig.resolveMediaUrl(newUrl, service: ApiService.auth);
          context.read<Session>().setProfilePhotoUrl(resolved == null
              ? null
              : '$resolved?v=${DateTime.now().millisecondsSinceEpoch}');
        }
      } else {
        final saved = await repo.uploadPassengerDocument(
          docType: req.key,
          filePath: picked.path,
        );
        if (!mounted) return;
        _docs = [..._docs.where((d) => d.docType != req.key), saved];
      }
      // Recargar requisitos: el estado lo calcula el backend.
      final reqs = await repo.getMyPassengerRequirements();
      if (!mounted) return;
      setState(() {
        _reqs = reqs;
        _message = req.key == 'profile_photo'
            ? 'Foto de perfil subida correctamente.'
            : 'Documento subido correctamente.';
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
    final isVerified = _reqs?.isVerified ?? false;
    final allUploaded = _reqs?.readyForReview ?? false;
    final reqs = _reqs?.requirements ?? const <PassengerRequirement>[];

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
                    if (reqs.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text('No se pudieron cargar los requisitos.',
                                  style: TextStyle(color: c.textMuted)),
                            ),
                            TextButton(
                                onPressed: _load,
                                child: const Text('Reintentar')),
                          ],
                        ),
                      ),
                    for (var i = 0; i < reqs.length; i++) ...[
                      _DocRow(
                        req: reqs[i],
                        doc: _docs
                            .where((d) => d.docType == reqs[i].key)
                            .firstOrNull,
                        uploading: _uploading == reqs[i].key,
                        onUpload: () => _upload(reqs[i]),
                      ),
                      if (i < reqs.length - 1)
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
  final PassengerRequirement req;
  final PassengerDocument? doc;
  final bool uploading;
  final VoidCallback onUpload;

  const _DocRow({
    required this.req,
    required this.doc,
    required this.uploading,
    required this.onUpload,
  });

  Color _statusColor(String s) {
    switch (s) {
      case 'pending':  return Colors.orange;
      case 'approved':
      case 'uploaded': return BugieColors.success;
      case 'rejected': return BugieColors.danger;
      default:         return BugieColors.danger; // missing
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'pending':  return 'En revisión';
      case 'approved': return 'Aprobado';
      case 'uploaded': return 'Subida';
      case 'rejected': return 'Rechazado';
      default:         return 'Falta';
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = req.status;
    final color = _statusColor(status);
    final isPhoto = req.key == 'profile_photo';
    final missing = status == 'missing';
    final reason = req.rejectionReason ?? doc?.rejectionReason;

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          CircleAvatar(
            backgroundColor: BugieColors.primary.withOpacity(0.1),
            child: Icon(isPhoto ? Icons.account_circle : Icons.badge,
                color: BugieColors.primary),
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
                    ...[
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
                Text(_reqDescription(req.key),
                    style: const TextStyle(
                        fontSize: 12, color: BugieColors.textMuted)),
                if (status == 'rejected' && reason != null) ...[
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      const Icon(Icons.info_outline,
                          size: 12, color: BugieColors.danger),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          'Motivo: $reason',
                          style: const TextStyle(
                              fontSize: 11, color: BugieColors.danger),
                        ),
                      ),
                    ],
                  ),
                ],
                if (!isPhoto && doc?.originalFileName != null) ...[
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
                : Icon(missing ? Icons.upload : Icons.refresh, size: 14),
            label: Text(
              uploading
                  ? 'Subiendo'
                  : missing
                      ? 'Subir'
                      : (isPhoto ? 'Cambiar' : 'Reemplazar'),
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}
