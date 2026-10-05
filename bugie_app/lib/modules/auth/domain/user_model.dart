import '../../../core/session/session.dart';

/// Respuesta del backend en /auth/login y /auth/register.
class AuthResponse {
  final String token;
  final String userId;
  final String fullName;
  final String email;
  final UserRole role;

  AuthResponse({
    required this.token,
    required this.userId,
    required this.fullName,
    required this.email,
    required this.role,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> j, String fallbackEmail) {
    final roleStr = (j['role'] ?? 'passenger').toString();
    UserRole role;
    switch (roleStr) {
      case 'driver':    role = UserRole.driver; break;
      case 'admin':     role = UserRole.admin; break;
      default:          role = UserRole.passenger;
    }
    return AuthResponse(
      token:    j['token'],
      userId:   j['userId'],
      fullName: j['fullName'] ?? '',
      email:    j['email'] ?? fallbackEmail,
      role:     role,
    );
  }
}

/// Datos del usuario logueado. Mapea UserProfileDto del backend (GET /auth/me).
/// Incluye datos que NO viajan en el JWT: phone, isVerified, profilePhotoUrl,
/// fecha de creación, documento de identidad y nombres separados.
class UserProfile {
  final String id;
  final String fullName;
  final String email;
  final String phone;
  final String role;
  final bool isActive;
  final bool isVerified;
  /// URL de foto de perfil. El backend la devuelve RELATIVA (/uploads/profiles/...).
  /// Usar ApiConfig.resolveMediaUrl() antes de mostrarla en Image.network.
  final String? profilePhotoUrl;
  final DateTime createdAt;

  /// Documento de identidad: 'DNI' | 'CE' | 'PASAPORTE' (null si aún no lo tiene).
  final String? docType;
  final String? docNumber;
  final String? firstNames;
  final String? lastNamePaternal;
  final String? lastNameMaternal;
  /// true si falta el documento o los nombres: la app pide completarlos.
  final bool needsProfileCompletion;
  final DateTime? deletedAt;
  final String? deletedReason;

  UserProfile({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.role,
    required this.isActive,
    required this.isVerified,
    this.profilePhotoUrl,
    required this.createdAt,
    this.docType,
    this.docNumber,
    this.firstNames,
    this.lastNamePaternal,
    this.lastNameMaternal,
    this.needsProfileCompletion = false,
    this.deletedAt,
    this.deletedReason,
  });

  bool get hasDocument => (docNumber ?? '').trim().isNotEmpty;

  /// "Paterno Materno" (sin el materno si no tiene).
  String get lastNames => [lastNamePaternal, lastNameMaternal]
      .where((s) => s != null && s.trim().isNotEmpty)
      .join(' ');

  /// Copia cambiando solo la foto (se usa al subir una nueva).
  UserProfile copyWithPhoto(String? url) => UserProfile(
        id: id,
        fullName: fullName,
        email: email,
        phone: phone,
        role: role,
        isActive: isActive,
        isVerified: isVerified,
        profilePhotoUrl: url,
        createdAt: createdAt,
        docType: docType,
        docNumber: docNumber,
        firstNames: firstNames,
        lastNamePaternal: lastNamePaternal,
        lastNameMaternal: lastNameMaternal,
        needsProfileCompletion: needsProfileCompletion,
        deletedAt: deletedAt,
        deletedReason: deletedReason,
      );

  static String? _str(dynamic v) {
    final s = v?.toString();
    return (s == null || s.trim().isEmpty) ? null : s;
  }

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        id:               j['id']?.toString() ?? '',
        fullName:         j['fullName'] ?? '',
        email:            j['email'] ?? '',
        phone:            j['phone'] ?? '',
        role:             j['role'] ?? 'passenger',
        isActive:         j['isActive'] == true,
        isVerified:       j['isVerified'] == true,
        profilePhotoUrl:  j['profilePhotoUrl'] as String?,
        createdAt:        DateTime.tryParse(j['createdAt'] ?? '') ??
                          DateTime.now(),
        docType:          _str(j['docType']),
        docNumber:        _str(j['docNumber']),
        firstNames:       _str(j['firstNames']),
        lastNamePaternal: _str(j['lastNamePaternal']),
        lastNameMaternal: _str(j['lastNameMaternal']),
        needsProfileCompletion: j['needsProfileCompletion'] == true,
        deletedAt:        DateTime.tryParse(j['deletedAt']?.toString() ?? ''),
        deletedReason:    _str(j['deletedReason']),
      );
}
