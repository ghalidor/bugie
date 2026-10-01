/// Documento del pasajero (DNI frontal/reverso para verificación de cuenta).
/// Mapea la respuesta de /api/auth/passengers/documents/me.
class PassengerDocument {
  final String id;
  final String docType; // 'dni_front' | 'dni_back'
  final String? fileUrl;
  final String? originalFileName;
  final String? mimeType;
  final int? sizeBytes;
  /// 'pending' | 'approved' | 'rejected'
  final String status;
  final String? rejectionReason;
  final DateTime createdAt;

  PassengerDocument({
    required this.id,
    required this.docType,
    required this.status,
    required this.createdAt,
    this.fileUrl,
    this.originalFileName,
    this.mimeType,
    this.sizeBytes,
    this.rejectionReason,
  });

  factory PassengerDocument.fromJson(Map<String, dynamic> j) =>
      PassengerDocument(
        id:               j['id'].toString(),
        docType:          (j['docType'] ?? '').toString(),
        status:           (j['status'] ?? 'pending').toString(),
        createdAt:        DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        fileUrl:          j['fileUrl']?.toString(),
        originalFileName: j['originalFileName']?.toString(),
        mimeType:         j['mimeType']?.toString(),
        sizeBytes:        (j['sizeBytes'] as num?)?.toInt(),
        rejectionReason:  j['rejectionReason']?.toString(),
      );
}

/// Estado de verificación del usuario.
/// Mapea /api/auth/users/me/status.
class UserVerificationStatus {
  final bool isActive;
  final bool isVerified;
  final String fullName;
  final String email;

  UserVerificationStatus({
    required this.isActive,
    required this.isVerified,
    required this.fullName,
    required this.email,
  });

  factory UserVerificationStatus.fromJson(Map<String, dynamic> j) =>
      UserVerificationStatus(
        isActive:   (j['isActive'] ?? false) as bool,
        isVerified: (j['isVerified'] ?? false) as bool,
        fullName:   (j['fullName'] ?? '').toString(),
        email:      (j['email'] ?? '').toString(),
      );
}
