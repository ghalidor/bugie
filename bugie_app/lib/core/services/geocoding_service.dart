import 'dart:convert';
import 'package:http/http.dart' as http;

/// Resultado de búsqueda geográfica.
class GeoResult {
  final String displayName;
  final double lat;
  final double lng;
  GeoResult({required this.displayName, required this.lat, required this.lng});

  /// Versión corta de la dirección (primeras 2-3 partes).
  String get shortAddress => displayName.split(',').take(2).join(',').trim();
}

/// Servicio de geocoding usando Nominatim (OpenStreetMap, gratis).
/// Misma fuente que el web (RequestRide.tsx → `geocode` y `reverseGeocode`).
class GeocodingService {
  static const _baseUrl = 'https://nominatim.openstreetmap.org';

  /// Busca direcciones con autocomplete. Sesgado a Trujillo, Perú.
  Future<List<GeoResult>> search(String query) async {
    if (query.trim().length < 3) return [];

    final q = Uri.encodeComponent('$query, Trujillo, Peru');
    // viewbox: -79.12,-8.05,-78.95,-8.18 (Trujillo) — igual al web
    final url = Uri.parse(
      '$_baseUrl/search?q=$q&format=json&limit=5&viewbox=-79.12,-8.05,-78.95,-8.18&bounded=1',
    );

    try {
      final res = await http.get(url, headers: {
        'Accept-Language': 'es',
        'User-Agent': 'BugieApp/1.0',
      });
      if (res.statusCode != 200) return [];

      final list = jsonDecode(res.body) as List;
      return list
          .map((j) => GeoResult(
                displayName: j['display_name'] ?? '',
                lat: double.tryParse(j['lat'].toString()) ?? 0,
                lng: double.tryParse(j['lon'].toString()) ?? 0,
              ))
          .toList();
    } catch (_) {
      return [];
    }
  }

  /// Reverse geocoding — dado un punto, devuelve dirección legible.
  Future<String> reverse(double lat, double lng) async {
    final url = Uri.parse('$_baseUrl/reverse?lat=$lat&lon=$lng&format=json');
    try {
      final res = await http.get(url, headers: {
        'Accept-Language': 'es',
        'User-Agent': 'BugieApp/1.0',
      });
      // Al fallar (429/403 por rate-limit, etc.) devolvemos VACÍO en vez de
      // coordenadas, para que cada pantalla use su propio texto por defecto
      // (ej. "Mi ubicación actual") en vez de mostrar lat/lng.
      if (res.statusCode != 200) return '';
      final j = jsonDecode(res.body) as Map<String, dynamic>;
      final name = j['display_name']?.toString() ?? '';
      if (name.isEmpty) return '';
      return name.split(',').take(2).join(',').trim();
    } catch (_) {
      return '';
    }
  }
}
