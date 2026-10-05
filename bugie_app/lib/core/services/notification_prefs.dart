import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Preferencias de notificación del usuario (se guardan en el celular).
///
///   - sound:          sonar los avisos dentro de la app.
///   - vibration:      vibrar con los avisos.
///   - requestSound:   (conductor) sonido especial para solicitudes nuevas.
///   - quietOffline:   (conductor) no sonar ni vibrar por solicitudes cuando
///                     está desconectado.
///
/// Se guarda con flutter_secure_storage (el mismo mecanismo que el tema; la
/// app no usa shared_preferences). Es un singleton: se carga en main.dart y
/// se expone con Provider, pero también se puede leer desde servicios sin
/// BuildContext: `NotificationPrefs().sound`.
class NotificationPrefs extends ChangeNotifier {
  static final NotificationPrefs _instance = NotificationPrefs._();
  factory NotificationPrefs() => _instance;
  NotificationPrefs._();

  static const _kSound = 'bugie_notif_sound';
  static const _kVibration = 'bugie_notif_vibration';
  static const _kRequestSound = 'bugie_notif_request_sound';
  static const _kQuietOffline = 'bugie_notif_quiet_offline';

  final _storage = const FlutterSecureStorage();

  bool _sound = true;
  bool _vibration = true;
  bool _requestSound = true;
  bool _quietOffline = true;

  bool get sound => _sound;
  bool get vibration => _vibration;
  bool get requestSound => _requestSound;
  bool get quietOffline => _quietOffline;

  /// Último estado conocido del conductor (lo actualiza DriverRepository al
  /// leer el perfil o al conectarse/desconectarse). null = no se sabe aún
  /// (en ese caso NO se silencian las solicitudes).
  static final ValueNotifier<bool?> driverOnline = ValueNotifier(null);

  /// true si el conductor está desconectado y pidió no ser molestado.
  bool get mutedForRequests => _quietOffline && driverOnline.value == false;

  /// Carga lo guardado. Si no hay nada, todo queda activado.
  Future<void> load() async {
    try {
      final values = await Future.wait([
        _storage.read(key: _kSound),
        _storage.read(key: _kVibration),
        _storage.read(key: _kRequestSound),
        _storage.read(key: _kQuietOffline),
      ]);
      _sound = values[0] != 'false';
      _vibration = values[1] != 'false';
      _requestSound = values[2] != 'false';
      _quietOffline = values[3] != 'false';
      notifyListeners();
    } catch (e) {
      debugPrint('NotificationPrefs: no se pudo leer: $e');
    }
  }

  Future<void> setSound(bool v) => _set(_kSound, v, () => _sound = v);
  Future<void> setVibration(bool v) =>
      _set(_kVibration, v, () => _vibration = v);
  Future<void> setRequestSound(bool v) =>
      _set(_kRequestSound, v, () => _requestSound = v);
  Future<void> setQuietOffline(bool v) =>
      _set(_kQuietOffline, v, () => _quietOffline = v);

  Future<void> _set(String key, bool value, VoidCallback apply) async {
    apply();
    notifyListeners();
    try {
      await _storage.write(key: key, value: value ? 'true' : 'false');
    } catch (e) {
      debugPrint('NotificationPrefs: no se pudo guardar $key: $e');
    }
  }
}
