import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../data/driver_repository.dart';
import '../domain/driver_document_model.dart';
import '../domain/driver_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';

/// Pantalla de Documentos del conductor.
/// Permite subir / reemplazar los documentos requeridos por el backend
/// (POST /api/drivers/documents, multipart) y enviarlos a revisión.
///
/// Tipos válidos en el backend (DocumentsController.cs):
///   dni_front, dni_back, license, soat, tarjeta_propiedad,
///   revision_tecnica, certificado_unico_laboral
///
/// Fecha de caducidad obligatoria para: license, soat, revision_tecnica.
class DriverDocumentsScreen extends StatefulWidget {
  const DriverDocumentsScreen({super.key});

  @override
  State<DriverDocumentsScreen> createState() => _DriverDocumentsScreenState();
}

/// Definición declarativa de los documentos requeridos.
class _DocRequirement {
  final String key;
  final String label;
  final IconData icon;
  final String description;
  final bool needsExpiry;
  const _DocRequirement({
    required this.key,
    required this.label,
    required this.icon,
    required this.description,
    this.needsExpiry = false,
  });
}

const List<_DocRequirement> _required = [
  _DocRequirement(
    key: 'dni_front',
    label: 'DNI - Frontal',
    icon: Icons.badge,
    description: 'Foto clara del frente de tu DNI.',
  ),
  _DocRequirement(
    key: 'dni_back',
    label: 'DNI - Reverso',
    icon: Icons.badge_outlined,
    description: 'Foto clara del reverso de tu DNI.',
  ),
  _DocRequirement(
    key: 'license',
    label: 'Licencia de conducir',
    icon: Icons.drive_eta,
    description: 'Licencia A-IIa o superior, vigente.',
    needsExpiry: true,
  ),
  _DocRequirement(
    key: 'soat',
    label: 'SOAT',
    icon: Icons.shield,
    description: 'SOAT vigente del vehículo.',
    needsExpiry: true,
  ),
  _DocRequirement(
    key: 'tarjeta_propiedad',
    label: 'Tarjeta de propiedad',
    icon: Icons.description,
    description: 'Tarjeta de propiedad del vehículo.',
  ),
  _DocRequirement(
    key: 'revision_tecnica',
    label: 'Revisión técnica',
    icon: Icons.build,
    description: 'Solo obligatoria si el vehículo tiene 5 años o más.',
    needsExpiry: true,
  ),
  _DocRequirement(
    key: 'certificado_unico_laboral',
    label: 'Certificado único laboral',
    icon: Icons.assignment_turned_in,
    description: 'Certificado único laboral del MTPE.',
  ),
];

/// Nombre visible de un tipo de documento. "profile_photo" no es un documento
/// sino la foto de perfil (POST /api/drivers/profile/me/photo), pero el backend
/// la incluye en missingDocuments cuando falta.
String driverDocLabel(String key) {
  if (key == 'profile_photo') return 'Foto de perfil';
  for (final r in _required) {
    if (r.key == key) return r.label;
  }
  return key;
}

/// Plazo para completar documentos (aprobación por excepción del admin).
/// Viene en GET /api/drivers/me: documentsDeadline (hora de Perú, sin zona),
/// strikes (faltas) y missingDocuments (tipos obligatorios que faltan).
/// Se lee directo del JSON para no tocar el modelo Driver.
class DriverDocsDeadline {
  final DateTime? deadline;
  final int strikes;
  final List<String> missing;

  const DriverDocsDeadline({this.deadline, this.strikes = 0, this.missing = const []});

  factory DriverDocsDeadline.fromJson(Map<String, dynamic> j) => DriverDocsDeadline(
        deadline: DateTime.tryParse(j['documentsDeadline']?.toString() ?? ''),
        strikes: (j['strikes'] as num?)?.toInt() ?? 0,
        missing: (j['missingDocuments'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      );

  bool get hasDeadline => deadline != null;
  List<String> get missingLabels => missing.map(driverDocLabel).toList();
  String get deadlineText =>
      deadline == null ? '' : DateFormat('dd/MM/yyyy HH:mm').format(deadline!);

  /// Consulta GET /api/drivers/me y devuelve solo los datos del plazo.
  static Future<DriverDocsDeadline?> fetch(ApiClient api) async {
    final json = await api.get('${ApiConfig.drivers}/drivers/me');
    if (json is! Map) return null;
    return DriverDocsDeadline.fromJson(Map<String, dynamic>.from(json));
  }
}

class _DriverDocumentsScreenState extends State<DriverDocumentsScreen> {
  Driver? _driver;
  DriverDocsDeadline? _deadline; // plazo por aprobación con excepción
  List<DriverDocument> _docs = [];
  bool _loading = true;
  bool _submitting = false;
  String? _uploading; // docType actualmente subiendo ('profile_photo' = foto)
  String? _error;
  String? _message;

  final _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _load();
    // Push de cuenta (aprobado, rechazado, documento por vencer): recargar.
    FcmService.driverAccount.addListener(_onAccountPush);
  }

  @override
  void dispose() {
    FcmService.driverAccount.removeListener(_onAccountPush);
    super.dispose();
  }

  void _onAccountPush() {
    if (mounted && _uploading == null && !_submitting) _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final repo = context.read<DriverRepository>();
    final api = context.read<ApiClient>();
    try {
      var d = await repo.getMyProfile();
      d ??= await repo.registerProfile();
      final docs = await repo.getMyDocuments();
      DriverDocsDeadline? deadline;
      try {
        deadline = await DriverDocsDeadline.fetch(api);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _driver = d;
        _deadline = deadline;
        _docs = docs;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'No se pudo cargar.'; });
    }
  }

  /// Sube un documento. Si requiere expiración, abre date picker antes.
  Future<void> _upload(_DocRequirement req) async {
    setState(() { _error = null; _message = null; });

    // 0) Preflight: preguntar al backend si está permitido renovar este doc
    //    ahora mismo (ventana de N días previos a caducar).
    //    Si NO se permite, mostrar el motivo y abortar antes del picker.
    final repo = context.read<DriverRepository>();
    final check = await repo.canUploadDocument(req.key);
    if (!mounted) return;
    if (!check.canUpload) {
      setState(() => _error = check.reason ??
          'No puedes actualizar este documento en este momento.');
      return;
    }

    // 1) Si requiere fecha, pedirla primero.
    DateTime? expiresAt;
    if (req.needsExpiry) {
      expiresAt = await _pickExpiryDate();
      if (expiresAt == null) return;
    }

    // 2) Seleccionar archivo (cámara o galería).
    final source = await _pickSource();
    if (source == null) return;

    final XFile? picked = await _picker.pickImage(
      source: source,
      maxWidth: 2000,
      imageQuality: 85,
    );
    if (picked == null) return;

    // 3) Subir.
    setState(() => _uploading = req.key);
    try {
      final saved = await repo.uploadDocument(
        docType: req.key,
        filePath: picked.path,
        expiresAt: expiresAt,
      );
      if (!mounted) return;
      setState(() {
        // Reemplazar el doc anterior (si había uno del mismo tipo) por el nuevo.
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

  /// Foto de perfil obligatoria: mismo flujo que en "Mi perfil"
  /// (POST /api/drivers/profile/me/photo).
  Future<void> _uploadProfilePhoto() async {
    setState(() { _error = null; _message = null; });
    final source = await _pickSource();
    if (source == null) return;
    final XFile? picked = await _picker.pickImage(
      source: source,
      maxWidth: 1200,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    setState(() => _uploading = 'profile_photo');
    try {
      final newUrl = await context
          .read<DriverRepository>()
          .uploadMyProfilePhoto(picked.path);
      if (!mounted) return;
      if (newUrl.isNotEmpty) {
        final resolved = ApiConfig.resolveMediaUrl(newUrl);
        context.read<Session>().setProfilePhotoUrl(resolved == null
            ? null
            : '$resolved?v=${DateTime.now().millisecondsSinceEpoch}');
      }
      setState(() {
        _message = 'Foto de perfil subida correctamente.';
        _uploading = null;
      });
      // Refrescar perfil y faltantes (missingDocuments) desde el backend.
      try {
        final repo = context.read<DriverRepository>();
        final api = context.read<ApiClient>();
        final d = await repo.getMyProfile();
        final deadline = await DriverDocsDeadline.fetch(api);
        if (mounted) {
          setState(() {
            if (d != null) _driver = d;
            _deadline = deadline;
          });
        }
      } catch (_) {}
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _uploading = null; });
    } catch (_) {
      if (mounted) {
        setState(() { _error = 'No se pudo subir la foto.'; _uploading = null; });
      }
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

  Future<DateTime?> _pickExpiryDate() async {
    final now = DateTime.now();
    return showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 30)),
      firstDate: now.add(const Duration(days: 1)),
      lastDate: DateTime(now.year + 10),
      helpText: 'Fecha de caducidad del documento',
    );
  }

  Future<void> _submitForReview() async {
    setState(() { _submitting = true; _error = null; _message = null; });
    try {
      final d = await context.read<DriverRepository>().submitForReview();
      if (mounted) setState(() {
        _driver = d;
        _message = 'Documentos enviados a revisión. Te avisaremos al aprobar.';
      });
    } on ApiException catch (e) {
      // 409 "Sube tu foto de perfil antes de enviar…" u otro: tal cual.
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo enviar.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: const BugieInternalHeader(title: 'Documentos'),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    // Para mostrar "Enviar a revisión": solo si el driver está en pendingDocs
    // y subió al menos algo (el backend decide si pasa o no, pero la UI lo
    // sugiere cuando hay un mínimo).
    final canSubmit = _driver?.status == DriverStatus.pendingDocs;
    // Foto de perfil: falta si el backend la lista en missingDocuments o si
    // el perfil no tiene URL.
    final photoMissing = (_deadline?.missing.contains('profile_photo') ?? false) ||
        (_driver != null &&
            (_driver!.profilePhotoUrl == null ||
                _driver!.profilePhotoUrl!.isEmpty));

    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Documentos'),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              // Estado actual
              Card(
                color: _statusColor(_driver?.status).withOpacity(0.1),
                child: ListTile(
                  leading: Icon(_statusIcon(_driver?.status),
                      color: _statusColor(_driver?.status), size: 36),
                  title: const Text('Estado actual',
                      style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(DriverStatus.label(_driver?.status ?? 1)),
                ),
              ),
              const SizedBox(height: 12),

              // Aviso: aprobado por excepción, con plazo para completar
              if (_deadline?.hasDeadline == true) ...[
                _DeadlineBanner(info: _deadline!),
                const SizedBox(height: 12),
              ],

              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
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
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(_message!,
                        style: const TextStyle(color: BugieColors.success)),
                  ),
                ),

              // Lista de documentos
              BugieCard(
                title: 'Documentos requeridos',
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    _ProfilePhotoRow(
                      missing: photoMissing,
                      uploading: _uploading == 'profile_photo',
                      onUpload: _uploadProfilePhoto,
                    ),
                    const Divider(height: 1, indent: 70),
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
                        'Bugie revisará tus documentos. Por favor espera la aprobación para poder empezar a recibir viajes.',
                        style: TextStyle(fontSize: 13, color: context.bugie.text),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              if (canSubmit)
                ElevatedButton.icon(
                  icon: const Icon(Icons.send),
                  label: const Text('Enviar a revisión'),
                  onPressed: _submitting ? null : _submitForReview,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Color _statusColor(int? s) {
    switch (s) {
      case DriverStatus.approved:    return BugieColors.success;
      case DriverStatus.rejected:    return BugieColors.danger;
      case DriverStatus.suspended:   return BugieColors.danger;
      case DriverStatus.underReview: return Colors.orange;
      default:                       return BugieColors.textMuted;
    }
  }

  IconData _statusIcon(int? s) {
    switch (s) {
      case DriverStatus.approved:    return Icons.check_circle;
      case DriverStatus.rejected:    return Icons.cancel;
      case DriverStatus.suspended:   return Icons.block;
      case DriverStatus.underReview: return Icons.hourglass_top;
      default:                       return Icons.upload_file;
    }
  }
}

/// Banner con la fecha límite y los documentos que faltan.
class _DeadlineBanner extends StatelessWidget {
  final DriverDocsDeadline info;
  const _DeadlineBanner({required this.info});

  @override
  Widget build(BuildContext context) {
    final labels = info.missingLabels;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BugieColors.warning.withOpacity(0.12),
        borderRadius: BorderRadius.circular(BugieRadius.md),
        border: Border.all(color: BugieColors.warning.withOpacity(0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.hourglass_top, color: BugieColors.warning),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Tienes hasta el ${info.deadlineText} para completar tus documentos',
                    style: TextStyle(
                        fontWeight: FontWeight.bold, color: context.bugie.text)),
                if (labels.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text('Te faltan (subidos y aprobados): ${labels.join(', ')}.',
                      style: TextStyle(fontSize: 13, color: context.bugie.text)),
                ],
                const SizedBox(height: 4),
                Text(
                  'Si no los completas a tiempo, tu cuenta se desactivará automáticamente y se te registrará una falta.',
                  style: TextStyle(fontSize: 12, color: context.bugie.textMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Fila "Foto de perfil" (obligatoria para enviar a revisión).
class _ProfilePhotoRow extends StatelessWidget {
  final bool missing;
  final bool uploading;
  final VoidCallback onUpload;

  const _ProfilePhotoRow({
    required this.missing,
    required this.uploading,
    required this.onUpload,
  });

  @override
  Widget build(BuildContext context) {
    final color = missing ? BugieColors.danger : BugieColors.success;
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: BugieColors.primary.withOpacity(0.1),
            child: const Icon(Icons.account_circle, color: BugieColors.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Flexible(
                      child: Text('Foto de perfil',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(missing ? 'Falta' : 'Subida',
                          style: TextStyle(fontSize: 10, color: color)),
                    ),
                  ],
                ),
                const Text(
                    'Una foto tuya de frente, con buena luz. La verán tus pasajeros.',
                    style: TextStyle(fontSize: 12, color: BugieColors.textMuted)),
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
              uploading ? 'Subiendo' : (missing ? 'Subir' : 'Cambiar'),
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

/// Helper para usar `.firstOrNull` en listas.
extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

class _DocRow extends StatelessWidget {
  final _DocRequirement req;
  final DriverDocument? doc;
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
      case 'pending':    return Colors.orange;
      case 'approved':   return BugieColors.success;
      case 'rejected':   return BugieColors.danger;
      case 'superseded': return BugieColors.textMuted;
      default:           return BugieColors.textMuted;
    }
  }

  String _statusLabel(String? s) {
    switch (s) {
      case 'pending':    return 'En revisión';
      case 'approved':   return 'Aprobado';
      case 'rejected':   return 'Rechazado';
      case 'superseded': return 'Reemplazado';
      default:           return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = doc?.status;
    final color = _statusColor(status);
    final expired = doc?.isExpired ?? false;

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          CircleAvatar(
            backgroundColor: BugieColors.primary.withOpacity(0.1),
            child: Icon(req.icon, color: BugieColors.primary),
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
                    if (expired) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: BugieColors.danger.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text('Vencido',
                            style: TextStyle(
                                fontSize: 10, color: BugieColors.danger)),
                      ),
                    ],
                  ],
                ),
                Text(req.description,
                    style: const TextStyle(
                        fontSize: 12, color: BugieColors.textMuted)),
                if (doc?.expiresAt != null) ...[
                  const SizedBox(height: 2),
                  Builder(builder: (_) {
                    final d = doc!;
                    final days = d.daysUntilExpiry ?? 0;
                    final dateStr = DateFormat('dd/MM/yyyy').format(d.expiresAt!);
                    Color color = BugieColors.textMuted;
                    String extra = '';
                    if (d.isExpired) {
                      color = BugieColors.danger;
                      extra = ' · caducado hace ${-days} ${(-days) == 1 ? 'día' : 'días'}';
                    } else if (d.isExpiringSoon) {
                      // Amarillo/warning si caduca en ≤4 días
                      color = const Color(0xFFB45309); // ámbar oscuro, legible
                      extra = ' · caduca en $days ${days == 1 ? 'día' : 'días'}';
                    }
                    return Text(
                      'Vence: $dateStr$extra',
                      style: TextStyle(fontSize: 11, color: color,
                          fontWeight: (d.isExpired || d.isExpiringSoon)
                              ? FontWeight.w600
                              : FontWeight.normal),
                    );
                  }),
                ],
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
