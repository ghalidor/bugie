import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/services/in_app_alert_service.dart';
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
    // ¿Le faltan documento o nombres? (cuentas antiguas). El admin no usa la
    // app móvil: la pantalla de login lo saca, así que no se consulta.
    if (auth.role != UserRole.admin) await refreshProfileCompletion();
    return auth;
  }

  /// POST /api/auth/register
  Future<AuthResponse> register({
    required String docType, // 'DNI' | 'CE' | 'PASAPORTE'
    required String docNumber,
    required String firstNames,
    required String lastNamePaternal,
    String? lastNameMaternal,
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
        'docType': docType,
        'docNumber': docNumber,
        'firstNames': firstNames,
        'lastNamePaternal': lastNamePaternal,
        if (lastNameMaternal != null && lastNameMaternal.trim().isNotEmpty)
          'lastNameMaternal': lastNameMaternal.trim(),
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

  /// Consulta GET /api/auth/me y guarda en la sesión si faltan documento o
  /// nombres. Si falla por red no bloquea (se vuelve a intentar al abrir la
  /// app). Un 401 (p. ej. cuenta eliminada) se relanza: ApiClient ya cerró
  /// la sesión local y quien llama puede mostrar el mensaje.
  Future<void> refreshProfileCompletion() async {
    try {
      final p = await getMyProfile();
      if (p != null) _session.setNeedsProfileCompletion(p.needsProfileCompletion);
    } on ApiException catch (e) {
      if (e.status == 401) rethrow;
    } catch (_) {}
  }

  /// PUT /api/auth/me/profile-completion
  /// [docType]/[docNumber] se omiten si la cuenta ya tenía documento.
  Future<UserProfile> completeProfile({
    String? docType,
    String? docNumber,
    required String firstNames,
    required String lastNamePaternal,
    String? lastNameMaternal,
  }) async {
    final json = await _api.put(
      '${ApiConfig.auth}/auth/me/profile-completion',
      body: {
        if (docType != null && docNumber != null) ...{
          'docType': docType,
          'docNumber': docNumber,
        },
        'firstNames': firstNames,
        'lastNamePaternal': lastNamePaternal,
        if (lastNameMaternal != null && lastNameMaternal.trim().isNotEmpty)
          'lastNameMaternal': lastNameMaternal.trim(),
      },
    );
    final profile = UserProfile.fromJson(json as Map<String, dynamic>);
    await _session.updateFullName(profile.fullName);
    _session.setNeedsProfileCompletion(profile.needsProfileCompletion);
    return profile;
  }

  /// POST /api/auth/me/change-password → mensaje de éxito del backend.
  Future<String> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final json = await _api.post(
      '${ApiConfig.auth}/auth/me/change-password',
      body: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
    // El cambio cierra todas las sesiones de la cuenta; esta sigue con el
    // token nuevo que devuelve el backend.
    final token = json is Map ? json['token']?.toString() : null;
    if (token != null && token.isNotEmpty) await _session.updateToken(token);
    final msg = json is Map ? json['message']?.toString() : null;
    return (msg == null || msg.isEmpty) ? 'Tu contraseña fue cambiada.' : msg;
  }

  /// POST /api/auth/me/delete-account. Si sale bien, cierra la sesión local
  /// completa (mismo logout de siempre) y devuelve el mensaje del backend.
  Future<String> deleteAccount({required String password, String? reason}) async {
    final json = await _api.post(
      '${ApiConfig.auth}/auth/me/delete-account',
      body: {
        'password': password,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );
    final msg = json is Map ? json['message']?.toString() : null;
    // El backend ya borró los tokens push de la cuenta: no llamamos a
    // unregister (con el JWT de una cuenta eliminada daría 401).
    await logout(unregisterPush: false);
    return (msg == null || msg.isEmpty) ? 'Tu cuenta fue eliminada.' : msg;
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
  Future<void> logout({bool unregisterPush = true}) async {
    if (unregisterPush) await FcmService().unregister();
    // Quitar banners pendientes para que no los vea el próximo usuario.
    InAppAlertService().clear();
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

  /// GET /api/auth/passengers/documents/me/requirements
  /// Requisitos de verificación (DNI frente, DNI reverso, foto de perfil).
  Future<PassengerRequirements> getMyPassengerRequirements() async {
    final json = await _api.get(
      '${ApiConfig.auth}/auth/passengers/documents/me/requirements',
    );
    return PassengerRequirements.fromJson(json as Map<String, dynamic>);
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
