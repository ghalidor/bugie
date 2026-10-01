import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Controla el modo de tema (claro / oscuro / sistema) y lo persiste.
///
/// Uso:
///   final ctrl = ThemeController();
///   await ctrl.load();              // al arrancar la app
///   ...
///   ctrl.setMode(ThemeMode.dark);   // desde la pantalla de ajustes
///   ctrl.toggle();                  // alterna claro <-> oscuro
///
/// Se expone vía Provider (ChangeNotifierProvider) y MaterialApp escucha
/// su `mode` para repintar toda la app.
class ThemeController extends ChangeNotifier {
  static const _key = 'bugie_theme_mode';
  final _storage = const FlutterSecureStorage();

  // Por defecto la app arranca en OSCURO. Si el usuario cambia a claro,
  // se guarda y se respeta en el próximo arranque.
  ThemeMode _mode = ThemeMode.dark;
  ThemeMode get mode => _mode;

  bool get isDark => _mode == ThemeMode.dark;

  /// Carga el modo guardado. Si no hay nada, queda en OSCURO (default).
  Future<void> load() async {
    final saved = await _storage.read(key: _key);
    switch (saved) {
      case 'light':
        _mode = ThemeMode.light;
        break;
      case 'system':
        _mode = ThemeMode.system;
        break;
      case 'dark':
      default:
        _mode = ThemeMode.dark;
    }
    notifyListeners();
  }

  Future<void> setMode(ThemeMode mode) async {
    _mode = mode;
    notifyListeners();
    await _storage.write(key: _key, value: _modeToString(mode));
  }

  /// Alterna entre claro y oscuro (útil para un botón rápido en el header).
  Future<void> toggle() async {
    final next = _mode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    await setMode(next);
  }

  String _modeToString(ThemeMode m) {
    switch (m) {
      case ThemeMode.light:
        return 'light';
      case ThemeMode.dark:
        return 'dark';
      case ThemeMode.system:
        return 'system';
    }
  }
}