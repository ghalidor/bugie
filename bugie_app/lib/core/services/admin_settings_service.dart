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

  /// Lee un setting numerico. Si no existe, no es un numero o falla la red,
  /// usa el fallback.
  Future<double> getDouble(String key, {required double fallback}) async {
    final map = await _loadAll();
    final raw = map[key]?.trim();
    if (raw == null) return fallback;
    final v = double.tryParse(raw);
    return v ?? fallback;
  }

  /// Lee un setting de texto (ya sin espacios). Vacio si no existe o falla la red.
  Future<String> getString(String key) async {
    final map = await _loadAll();
    return map[key]?.trim() ?? '';
  }

  /// Contacto de soporte que el admin configura (support_phone / support_email).
  /// Cualquiera de los dos puede venir vacio.
  Future<({String phone, String email})> getSupportContact() async {
    return (
      phone: await getString('support_phone'),
      email: await getString('support_email'),
    );
  }

  /// Tarifa base y tarifa por kilometro, tal como las configura el admin.
  ///
  /// Antes estaban escritas a mano en las pantallas de solicitar viaje y
  /// envio: max(5, km * 1.5). Y al mismo tiempo el admin tenia esos campos
  /// editables sin que cambiaran nada.
  ///
  /// Una tarifa de 0 o negativa no tiene sentido, asi que en ese caso se usa
  /// el valor de respaldo en vez de dejar los viajes en cero.
  Future<({double baseFare, double perKm})> getFareConfig() async {
    final base = await getDouble('base_fare',   fallback: 5.0);
    final km   = await getDouble('fare_per_km', fallback: 1.5);
    return (
      baseFare: base > 0 ? base : 5.0,
      perKm:    km   > 0 ? km   : 1.5,
    );
  }

  /// Reglas de monto de la negociación (Admin > Configuración):
  /// base_fare (mínimo) y fare_max_multiplier (máximo = tarifa pedida × esto).
  /// Mismos criterios que el backend (Trips: NegotiationRules).
  Future<FareRules> getFareRules() async {
    final base = await getDouble('base_fare', fallback: 0);
    final mult = await getDouble('fare_max_multiplier', fallback: 3);
    return FareRules(
      minFare: base > 0 ? base : null,
      maxMultiplier: mult >= 1 ? mult : 3,
    );
  }

  /// Invalida el cache. Útil tras un cambio manual del admin si fuera el
  /// caso, o si necesitas forzar refresco.
  void invalidate() {
    _cache = null;
    _cacheAt = null;
  }
}

/// Reglas de monto para pedir, ofertar y contraofertar (igual que el backend
/// y la web): mínimo = base_fare; máximo = tarifa pedida × fare_max_multiplier.
class FareRules {
  /// Tarifa base del admin. null si no la configuró (no se exige mínimo).
  final double? minFare;
  final double maxMultiplier;

  const FareRules({this.minFare, this.maxMultiplier = 3});

  static String _soles(double v) => 'S/ ${v.toStringAsFixed(2)}';

  /// Rango permitido para ofertar/contraofertar en un viaje cuya tarifa
  /// pedida es [suggestedFare]. El máximo nunca es menor que el mínimo.
  ({double min, double max}) range(double suggestedFare) {
    final min = minFare ?? 0.01;
    final max = (suggestedFare * maxMultiplier * 100).round() / 100;
    return (min: min, max: max < min ? min : max);
  }

  /// "Entre S/ X y S/ Y" (se muestra junto al campo del monto).
  String rangeHint(double suggestedFare) {
    final r = range(suggestedFare);
    return 'Entre ${_soles(r.min)} y ${_soles(r.max)}';
  }

  /// Mensaje si el monto está fuera del rango (mismo texto que el backend);
  /// null si es válido.
  String? rangeError(double amount, double suggestedFare) {
    final r = range(suggestedFare);
    return amount < r.min || amount > r.max
        ? 'El monto debe estar entre ${_soles(r.min)} y ${_soles(r.max)}.'
        : null;
  }

  /// Al crear un viaje o envío solo aplica el mínimo (mismo texto que el backend).
  String? createError(double amount) =>
      minFare != null && amount < minFare!
          ? 'El monto debe ser al menos ${_soles(minFare!)}.'
          : null;

  /// Texto cuando el monto escrito no es un número mayor que 0.
  static const invalidAmount = 'Ingresa un monto válido.';

  /// Lee el monto escrito (acepta coma decimal). null si no es un número > 0.
  static double? parse(String raw) {
    final v = double.tryParse(raw.replaceAll(',', '.').trim());
    return v == null || v <= 0 ? null : v;
  }
}
