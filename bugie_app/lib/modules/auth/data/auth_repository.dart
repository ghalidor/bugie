import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/session/session.dart';
import '../domain/passenger_document_model.dart';
import '../domain/user_model.dart';

/// Repositorio de autenticación.
/// Es la única puerta de entrada a las APIs de Auth (puerto 5001).
class AuthRepository {
  final ApiClient _api;
  final Session _session;

  AuthRepository(this._api, this._session);

  /// POST /api/auth/login
  Future<AuthResponse> login(String email, String password) async {
    final json = await _api.post(
      '${ApiConfig.auth}/auth/login',
      body: {'email': email, 'password': password},
    );
    final auth = AuthResponse.fromJson(json, email);
    await _saveSession(auth);
    return auth;
  }

  /// POST /api/auth/register
  Future<AuthResponse> register({
    required String fullName,
    required String email,
    required String password,
    required String phone,
    required String role, // 'passenger' o 'driver'
    bool acceptedTerms = true,
    String? signatureImage,
    /// Codigo de invitacion. Opcional: si viene vacio no se manda.
    String? referralCode,
  }) async {
    final json = await _api.post(
      '${ApiConfig.auth}/auth/register',
      body: {
        'fullName': fullName,
        'email': email,
        'password': password,
        'phone': phone,
        'role': role,
        'acceptedTerms': acceptedTerms,
        'signatureImage': signatureImage,
        // Solo se envia si tiene algo: asi el backend lo trata como ausente.
        if (referralCode != null && referralCode.trim().isNotEmpty)
          'referralCode': referralCode.trim().toUpperCase(),
      },
    );
    final auth = AuthResponse.fromJson(json, email);
    await _saveSession(auth);
    return auth;
  }

  /// POST /api/auth/forgot-password
  Future<String> forgotPassword(String email) async {
    final json = await _api.post(
      '${ApiConfig.auth}/auth/forgot-password',
      body: {'email': email},
    );
    return (json?['message'] ?? 'Si el correo existe, se envió un enlace.').toString();
  }

  /// POST /api/auth/reset-password
  Future<bool> resetPassword(String token, String newPassword) async {
    final json = await _api.post(
      '${ApiConfig.auth}/auth/reset-password',
      body: {'token': token, 'newPassword': newPassword},
    );
    return json?['success'] == true;
  }

  /// GET /api/auth/me
  Future<Map<String, dynamic>?> me() async {
    final json = await _api.get('${ApiConfig.auth}/auth/me');
    return json as Map<String, dynamic>?;
  }

  /// GET /api/auth/me — tipado.
  /// Devuelve el perfil completo del usuario actual. Útil para la pantalla
  /// de perfil, que necesita teléfono, isVerified, fecha de creación y foto.
  Future<UserProfile?> getMyProfile() async {
    final json = await me();
    if (json == null) return null;
    return UserProfile.fromJson(json);
  }

  /// POST /api/auth/me/profile-photo (multipart "file").
  /// Sube/cambia la foto de perfil. Devuelve la nueva URL pública.
  Future<String> uploadProfilePhoto(String filePath) async {
    final json = await _api.postMultipart(
      '${ApiConfig.auth}/auth/me/profile-photo',
      fields: {},
      filePath: filePath,
    );
    return (json as Map<String, dynamic>)['profilePhotoUrl'] as String? ?? '';
  }

  /// Cierra sesión: primero quita el token push de este celular en el
  /// backend (necesita la sesión), luego borra la sesión local.
  Future<void> logout() async {
    await FcmService().unregister();
    await _session.clear();
  }

  // ── Documentos del pasajero (DNI front/back) ─────────────────────────────

  /// GET /api/auth/users/me/status
  Future<UserVerificationStatus> getMyStatus() async {
    final json = await _api.get('${ApiConfig.auth}/auth/users/me/status');
    return UserVerificationStatus.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/auth/passengers/documents/me
  Future<List<PassengerDocument>> getMyPassengerDocuments() async {
    final json = await _api.get(
      '${ApiConfig.auth}/auth/passengers/documents/me',
    );
    final list = (json as List?) ?? [];
    return list
        .map((d) => PassengerDocument.fromJson(d as Map<String, dynamic>))
        .toList();
  }

  /// POST /api/auth/passengers/documents (multipart)
  Future<PassengerDocument> uploadPassengerDocument({
    required String docType, // 'dni_front' | 'dni_back'
    required String filePath,
  }) async {
    final json = await _api.postMultipart(
      '${ApiConfig.auth}/auth/passengers/documents',
      fields: {'docType': docType},
      filePath: filePath,
    );
    return PassengerDocument.fromJson(json as Map<String, dynamic>);
  }

  Future<void> _saveSession(AuthResponse auth) async {
    await _session.save(
      token: auth.token,
      user: SessionUser(
        userId: auth.userId,
        fullName: auth.fullName,
        email: auth.email,
        role: auth.role,
      ),
    );
    // Con la sesión ya guardada, asociar este celular al usuario para
    // que le lleguen los avisos push (no bloquea el login si falla).
    FcmService().registerToken();
  }
}
