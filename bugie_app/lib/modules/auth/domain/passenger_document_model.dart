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

/// Un requisito de verificación del pasajero.
/// key: 'dni_front' | 'dni_back' | 'profile_photo'.
/// status: missing | pending | approved | rejected (foto: missing | uploaded).
class PassengerRequirement {
  final String key;
  final String label;
  final String status;
  final String? rejectionReason;
  final bool done;

  PassengerRequirement({
    required this.key,
    required this.label,
    required this.status,
    required this.done,
    this.rejectionReason,
  });

  factory PassengerRequirement.fromJson(Map<String, dynamic> j) =>
      PassengerRequirement(
        key:             (j['key'] ?? '').toString(),
        label:           (j['label'] ?? '').toString(),
        status:          (j['status'] ?? 'missing').toString(),
        done:            j['done'] == true,
        rejectionReason: j['rejectionReason']?.toString(),
      );
}

/// Respuesta de GET /api/auth/passengers/documents/me/requirements.
class PassengerRequirements {
  final bool isVerified;
  final bool readyForReview;
  final List<String> missing;
  final List<PassengerRequirement> requirements;

  PassengerRequirements({
    required this.isVerified,
    required this.readyForReview,
    required this.missing,
    required this.requirements,
  });

  factory PassengerRequirements.fromJson(Map<String, dynamic> j) =>
      PassengerRequirements(
        isVerified:     j['isVerified'] == true,
        readyForReview: j['readyForReview'] == true,
        missing: (j['missing'] as List?)?.map((e) => e.toString()).toList() ??
            const [],
        requirements: ((j['requirements'] as List?) ?? const [])
            .map((e) =>
                PassengerRequirement.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}
