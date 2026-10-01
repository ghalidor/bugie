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
/// Incluye datos que NO viajan en el JWT: phone, isVerified, profilePhotoUrl
/// y fecha de creación.
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
  });

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
      );
}
