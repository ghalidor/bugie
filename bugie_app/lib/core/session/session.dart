import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Roles soportados por el backend Bugie.
enum UserRole { passenger, driver, admin }

UserRole _roleFromString(String r) {
  switch (r) {
    case 'driver':    return UserRole.driver;
    case 'admin':     return UserRole.admin;
    case 'passenger':
    default:          return UserRole.passenger;
  }
}

String roleToString(UserRole r) => r.name;

/// Datos del usuario logueado.
/// Mismos campos que el SessionUser del web (state/session.ts).
class SessionUser {
  final String userId;
  final String fullName;
  final String email;
  final UserRole role;

  SessionUser({
    required this.userId,
    required this.fullName,
    required this.email,
    required this.role,
  });

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'fullName': fullName,
        'email': email,
        'role': roleToString(role),
      };

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
        userId: j['userId'],
        fullName: j['fullName'],
        email: j['email'],
        role: _roleFromString(j['role']),
      );
}

/// Maneja la sesión: token JWT + datos del usuario.
/// Equivale a state/session.ts del web, pero usando flutter_secure_storage
/// (más seguro que SharedPreferences porque cifra el token).
class Session extends ChangeNotifier {
  static const _kToken = 'bugie_token';
  static const _kUser  = 'bugie_user';

  final _storage = const FlutterSecureStorage();
  SessionUser? _user;

  SessionUser? get user => _user;
  bool get isLoggedIn => _user != null;
  UserRole? get role => _user?.role;

  // Foto de perfil (URL completa ya resuelta). Se cachea aqui para que TODOS
  // los avatares (inicio, cuenta, mis datos) se actualicen juntos al subir una
  // nueva. La llena el primer ProfileAvatar que la consulta.
  String? _profilePhotoUrl;
  bool _photoFetched = false;
  String? get profilePhotoUrl => _profilePhotoUrl;
  bool get photoFetched => _photoFetched;

  void setProfilePhotoUrl(String? url) {
    _profilePhotoUrl = url;
    _photoFetched = true;
    notifyListeners();
  }

  /// Llamar una vez al arrancar la app.
  /// Si secure_storage falla (puede pasar en algunos emuladores Android), no
  /// rompemos la app: simplemente queda sin usuario y el router redirige a /.
  Future<void> load() async {
    try {
      final raw = await _storage.read(key: _kUser);
      debugPrint('[Session] load: storage tiene user? ${raw != null}');
      if (raw != null) {
        try {
          _user = SessionUser.fromJson(jsonDecode(raw));
          debugPrint('[Session] load: user=${_user?.email} role=${_user?.role}');
        } catch (e) {
          debugPrint('[Session] load: error parsing user JSON: $e');
          _user = null;
        }
      } else {
        debugPrint('[Session] load: NO hay user guardado en storage.');
      }
    } catch (e) {
      // secure_storage puede fallar al primer arranque en emuladores Android
      // por temas de Keystore. No rompemos la app: solo dejamos al usuario
      // sin sesión y el router lo manda a /.
      debugPrint('[Session] load: ERROR leyendo secure_storage: $e');
      _user = null;
    }
    notifyListeners();
  }

  Future<String?> getToken() => _storage.read(key: _kToken);

  /// Guarda token + usuario tras login/registro exitoso.
  Future<void> save({required String token, required SessionUser user}) async {
    await _storage.write(key: _kToken, value: token);
    await _storage.write(key: _kUser,  value: jsonEncode(user.toJson()));
    _user = user;
    notifyListeners();
  }

  /// Cerrar sesión.
  Future<void> clear() async {
    await _storage.delete(key: _kToken);
    await _storage.delete(key: _kUser);
    _user = null;
    _profilePhotoUrl = null;
    _photoFetched = false;
    notifyListeners();
  }
}
