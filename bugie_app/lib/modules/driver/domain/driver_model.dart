/// Estados del conductor (DriverStatus en el backend).
class DriverStatus {
  static const pendingDocs  = 1; // Falta subir documentos
  static const underReview  = 2; // Esperando aprobación admin
  static const approved     = 3; // Aprobado
  static const suspended    = 4; // Suspendida por el admin (con o sin fecha fin)
  static const rejected     = 5; // Registro no aceptado por el admin
  static const expiredDocs  = 6; // Algún documento venció

  static String label(int s) {
    switch (s) {
      case pendingDocs:  return 'Documentos pendientes';
      case underReview:  return 'En revisión';
      case approved:     return 'Aprobado';
      case suspended:    return 'Suspendida';
      case rejected:     return 'No aceptada';
      case expiredDocs:  return 'Documentos vencidos';
      default:           return 'Desconocido';
    }
  }

  /// Suspendido o rechazado: no puede conectarse, aceptar ni proponer viajes.
  static bool isBlocked(int s) => s == suspended || s == rejected;
}

/// Solicitud de revisión abierta del conductor (cuenta suspendida o
/// rechazada), esperando respuesta del equipo de Bugie.
class DriverReviewRequest {
  final String id;
  final String message;
  final DateTime? createdAt;

  DriverReviewRequest({
    required this.id,
    required this.message,
    this.createdAt,
  });

  factory DriverReviewRequest.fromJson(Map<String, dynamic> j) =>
      DriverReviewRequest(
        id:        j['id']?.toString() ?? '',
        message:   j['message']?.toString() ?? '',
        createdAt: DateTime.tryParse(j['createdAt']?.toString() ?? ''),
      );
}

class Driver {
  final String id;
  final String userId;
  final int status;
  final bool isOnline;
  final double? rating;
  /// URL de la foto de perfil (subida por el conductor en /profile/me/photo).
  /// Viene como URL relativa del backend → resolver con ApiConfig.resolveMediaUrl.
  final String? profilePhotoUrl;
  final DateTime createdAt;

  /// Motivo de la suspensión o del rechazo (solo estados 4 y 5).
  final String? statusReason;

  /// Último día de la suspensión (hora Perú, sin zona). Null = indefinida.
  final DateTime? suspendedUntil;

  /// Solicitud de revisión abierta (si la hay).
  final DriverReviewRequest? openReviewRequest;

  Driver({
    required this.id,
    required this.userId,
    required this.status,
    required this.isOnline,
    this.rating,
    this.profilePhotoUrl,
    required this.createdAt,
    this.statusReason,
    this.suspendedUntil,
    this.openReviewRequest,
  });

  bool get isSuspended => status == DriverStatus.suspended;
  bool get isRejected  => status == DriverStatus.rejected;
  bool get isBlocked   => DriverStatus.isBlocked(status);

  factory Driver.fromJson(Map<String, dynamic> j) => Driver(
        id:         j['id'].toString(),
        userId:     j['userId']?.toString() ?? '',
        status:     (j['status'] ?? 1) as int,
        isOnline:   j['isOnline'] == true,
        rating:     (j['rating'] as num?)?.toDouble(),
        profilePhotoUrl: j['profilePhotoUrl'] as String?,
        createdAt:  DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        statusReason: j['statusReason'] as String?,
        suspendedUntil: DateTime.tryParse(j['suspendedUntil']?.toString() ?? ''),
        openReviewRequest: j['openReviewRequest'] is Map<String, dynamic>
            ? DriverReviewRequest.fromJson(
                j['openReviewRequest'] as Map<String, dynamic>)
            : null,
      );
}

/// Foto de perfil nueva que todavía no se muestra (GET
/// /api/drivers/profile/me: pendingPhotoUrl, pendingPhotoStatus,
/// pendingPhotoReason). Mientras está en revisión se sigue mostrando la
/// foto anterior.
class PendingProfilePhoto {
  /// URL relativa de la foto pendiente (resolver con ApiConfig.resolveMediaUrl).
  final String? url;

  /// 'pending_review' | 'rejected' | null (sin foto pendiente).
  final String? status;

  /// Motivo del rechazo (solo si status = 'rejected').
  final String? reason;

  const PendingProfilePhoto({this.url, this.status, this.reason});

  bool get inReview => status == 'pending_review';
  bool get isRejected => status == 'rejected';

  factory PendingProfilePhoto.fromJson(Map<String, dynamic> j) =>
      PendingProfilePhoto(
        url: j['pendingPhotoUrl'] as String?,
        status: j['pendingPhotoStatus'] as String?,
        reason: j['pendingPhotoReason'] as String?,
      );
}

/// Respuesta de POST /api/drivers/profile/me/photo.
class ProfilePhotoUploadResult {
  /// URL relativa de la foto subida.
  final String photoUrl;

  /// 'approved' | 'pending_review'.
  final String? status;
  final String? message;

  /// Intentos de subida que le quedan hoy (null si el backend no lo manda).
  final int? attemptsLeftToday;

  const ProfilePhotoUploadResult({
    required this.photoUrl,
    this.status,
    this.message,
    this.attemptsLeftToday,
  });

  /// La foto quedó en revisión: se sigue mostrando la anterior.
  bool get inReview => status == 'pending_review';

  static const inReviewText =
      'Tu foto nueva está en revisión. Mientras tanto se sigue mostrando tu foto anterior.';

  /// "Te quedan 2 intentos hoy." / "Te queda 1 intento hoy." /
  /// "Ya no te quedan intentos hoy." (vacío si no viene el dato).
  String get attemptsText {
    final n = attemptsLeftToday;
    if (n == null) return '';
    if (n <= 0) return 'Ya no te quedan intentos hoy.';
    return n == 1 ? 'Te queda 1 intento hoy.' : 'Te quedan $n intentos hoy.';
  }

  factory ProfilePhotoUploadResult.fromJson(Map<String, dynamic> j) =>
      ProfilePhotoUploadResult(
        // Antes la respuesta traía profilePhotoUrl; ahora photoUrl.
        photoUrl: (j['photoUrl'] ?? j['profilePhotoUrl'])?.toString() ?? '',
        status: j['status'] as String?,
        message: j['message'] as String?,
        attemptsLeftToday: (j['attemptsLeftToday'] as num?)?.toInt(),
      );
}
