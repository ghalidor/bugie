/// Documento del conductor.
/// Mapea la respuesta de /api/drivers/documents/me.
class DriverDocument {
  final String id;
  final String docType;
  final String? fileUrl;
  final String? originalFileName;
  final String? mimeType;
  final int? sizeBytes;
  /// 'pending' | 'approved' | 'rejected' | 'superseded'
  final String status;
  final String? rejectionReason;
  final DateTime? expiresAt;
  final DateTime createdAt;

  DriverDocument({
    required this.id,
    required this.docType,
    required this.status,
    required this.createdAt,
    this.fileUrl,
    this.originalFileName,
    this.mimeType,
    this.sizeBytes,
    this.rejectionReason,
    this.expiresAt,
  });

  factory DriverDocument.fromJson(Map<String, dynamic> j) => DriverDocument(
        id:               j['id'].toString(),
        docType:          (j['docType'] ?? '').toString(),
        status:           (j['status'] ?? 'pending').toString(),
        createdAt:        DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        fileUrl:          j['fileUrl']?.toString(),
        originalFileName: j['originalFileName']?.toString(),
        mimeType:         j['mimeType']?.toString(),
        sizeBytes:        (j['sizeBytes'] as num?)?.toInt(),
        rejectionReason:  j['rejectionReason']?.toString(),
        expiresAt:        j['expiresAt'] == null
            ? null
            : DateTime.tryParse(j['expiresAt'].toString()),
      );

  bool get isExpired {
    if (expiresAt == null) return false;
    return expiresAt!.isBefore(DateTime.now());
  }

  /// Días restantes hasta caducar. Negativo si ya caducó. Null si no aplica.
  int? get daysUntilExpiry {
    if (expiresAt == null) return null;
    final diff = expiresAt!.difference(DateTime.now()).inDays;
    return diff;
  }

  /// True si caduca pronto (≤ 4 días) pero todavía no caduca.
  bool get isExpiringSoon {
    final d = daysUntilExpiry;
    if (d == null) return false;
    return d >= 0 && d <= 4;
  }

  /// Etiqueta legible del tipo de documento.
  String get docTypeLabel {
    switch (docType.toLowerCase()) {
      case 'licencia':           return 'Licencia de conducir';
      case 'soat':               return 'SOAT';
      case 'revision_tecnica':   return 'Revisión técnica';
      case 'antecedentes':       return 'Antecedentes penales';
      case 'dni':                return 'DNI';
      case 'tarjeta_propiedad':  return 'Tarjeta de propiedad';
      default:                   return docType;
    }
  }
}
