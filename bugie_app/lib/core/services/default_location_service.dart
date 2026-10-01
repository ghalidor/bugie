import 'package:latlong2/latlong.dart';
import '../api/api_client.dart';
import '../api/api_config.dart';

/// Configuración por defecto del mapa.
/// Se obtiene del backend (Landing API → /settings), igual que el web.
class DefaultLocation {
  final LatLng center;
  final double zoom;
  DefaultLocation({required this.center, required this.zoom});

  /// Trujillo centro como fallback (igual al web).
  static final fallback = DefaultLocation(
    center: LatLng(-8.109052, -79.021534),
    zoom: 14,
  );
}

/// Servicio que obtiene la configuración del mapa desde el backend.
/// Replica el hook useDefaultLocation.ts del web.
class DefaultLocationService {
  final ApiClient _api;
  DefaultLocation? _cache;

  DefaultLocationService(this._api);

  /// Obtiene la ubicación por defecto. Cachea el resultado en memoria.
  Future<DefaultLocation> get() async {
    if (_cache != null) return _cache!;

    try {
      final json = await _api.get('${ApiConfig.landing}/landing/settings');
      final list = (json as List?) ?? [];

      double? lat, lng;
      double? zoom;
      for (final s in list) {
        final m = s as Map<String, dynamic>;
        final key = m['settingKey']?.toString();
        final val = m['value']?.toString();
        if (val == null) continue;
        if (key == 'default_lat')  lat  = double.tryParse(val);
        if (key == 'default_lng')  lng  = double.tryParse(val);
        if (key == 'default_zoom') zoom = double.tryParse(val);
      }

      _cache = DefaultLocation(
        center: LatLng(
          lat ?? DefaultLocation.fallback.center.latitude,
          lng ?? DefaultLocation.fallback.center.longitude,
        ),
        zoom: zoom ?? DefaultLocation.fallback.zoom,
      );
      return _cache!;
    } catch (_) {
      return DefaultLocation.fallback;
    }
  }
}
