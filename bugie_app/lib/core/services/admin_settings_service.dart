import '../api/api_client.dart';
import '../api/api_config.dart';

/// Servicio para leer configuración global del admin desde Landing.
/// Endpoint público: GET /api/landing/settings → lista de {settingKey, value}.
///
/// Cacheo en memoria por 60 segundos. Es config que cambia muy poco; volver a
/// pegarle al backend cada poll sería desperdicio. Si el admin cambia algo y
/// el usuario sigue con la app abierta, el cambio se reflejará al minuto.
class AdminSettingsService {
  final ApiClient _api;
  Map<String, String>? _cache;
  DateTime? _cacheAt;
  static const _cacheTtl = Duration(seconds: 60);

  AdminSettingsService(this._api);

  /// Carga todos los settings (o usa cache).
  Future<Map<String, String>> _loadAll() async {
    final now = DateTime.now();
    if (_cache != null &&
        _cacheAt != null &&
        now.difference(_cacheAt!) < _cacheTtl) {
      return _cache!;
    }

    try {
      final json = await _api.get('${ApiConfig.landing}/landing/settings');
      final list = (json as List?) ?? [];
      final map = <String, String>{};
      for (final s in list) {
        final m = s as Map<String, dynamic>;
        final key = m['settingKey']?.toString();
        final val = m['value']?.toString();
        if (key != null && val != null) map[key] = val;
      }
      _cache = map;
      _cacheAt = now;
      return map;
    } catch (_) {
      // Si falla, devolver el cache viejo si existe, sino vacío.
      return _cache ?? const {};
    }
  }

  /// Lee un setting booleano. Si no existe o falla la red, usa el fallback.
  /// Reconoce: 'true'/'false', '1'/'0', 'yes'/'no' (case-insensitive).
  Future<bool> getBool(String key, {required bool fallback}) async {
    final map = await _loadAll();
    final raw = map[key]?.toLowerCase().trim();
    if (raw == null) return fallback;
    if (raw == 'true' || raw == '1' || raw == 'yes') return true;
    if (raw == 'false' || raw == '0' || raw == 'no') return false;
    return fallback;
  }

  /// Invalida el cache. Útil tras un cambio manual del admin si fuera el
  /// caso, o si necesitas forzar refresco.
  void invalidate() {
    _cache = null;
    _cacheAt = null;
  }
}
