import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/favorite_address_model.dart';

/// Repositorio del sistema de favoritos del pasajero.
/// Vive en Trips API (puerto 5002).
///
/// Maneja dos cosas:
///   - Conductores favoritos: IDs (set/check/add/remove).
///   - Direcciones favoritas: CRUD completo con etiqueta + lat/lng.
class FavoritesRepository {
  final ApiClient _api;
  FavoritesRepository(this._api);

  // ═════════════════════════════════════════════════════════════════════
  // Conductores favoritos
  // ═════════════════════════════════════════════════════════════════════

  /// Devuelve los IDs (userId) de conductores favoritos.
  /// Útil para inicializar el estado al cargar la lista de conductores
  /// cercanos: con un Set<String> en memoria sabemos cuáles tienen corona.
  Future<Set<String>> getFavoriteDriverIds() async {
    final json = await _api.get('${ApiConfig.trips}/favorites/drivers');
    final list = (json['driverUserIds'] as List?)?.cast<String>() ?? [];
    return list.toSet();
  }

  /// Verificación puntual (cuando entras al detalle de un conductor).
  Future<bool> isFavorite(String driverUserId) async {
    final json = await _api.get('${ApiConfig.trips}/favorites/drivers/$driverUserId/is-favorite');
    return json['isFavorite'] as bool? ?? false;
  }

  /// Marca al conductor como favorito. Idempotente: si ya estaba, no falla.
  Future<void> addDriver(String driverUserId) =>
      _api.post('${ApiConfig.trips}/favorites/drivers/$driverUserId');

  /// Quita el favorito.
  Future<void> removeDriver(String driverUserId) =>
      _api.delete('${ApiConfig.trips}/favorites/drivers/$driverUserId');

  // ═════════════════════════════════════════════════════════════════════
  // Direcciones favoritas
  // ═════════════════════════════════════════════════════════════════════

  Future<List<FavoriteAddress>> getAddresses() async {
    final raw = await _api.get('${ApiConfig.trips}/favorites/addresses');
    final list = raw is List ? raw : (raw['items'] as List? ?? []);
    return list.map((e) => FavoriteAddress.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Crea una nueva. El backend la pone al final automáticamente (SortOrder = max+1).
  Future<FavoriteAddress> addAddress({
    required String label,
    required String icon,
    required String address,
    required double lat,
    required double lng,
    String? description,
  }) async {
    final json = await _api.post('${ApiConfig.trips}/favorites/addresses', body: {
      'label':   label,
      'icon':    icon,
      'address': address,
      'lat':     lat,
      'lng':     lng,
      'description': description,
    });
    return FavoriteAddress.fromJson(json);
  }

  Future<FavoriteAddress> updateAddress({
    required String id,
    required String label,
    required String icon,
    required String address,
    required double lat,
    required double lng,
    String? description,
  }) async {
    final json = await _api.put('${ApiConfig.trips}/favorites/addresses/$id', body: {
      'label':   label,
      'icon':    icon,
      'address': address,
      'lat':     lat,
      'lng':     lng,
      'description': description,
    });
    return FavoriteAddress.fromJson(json);
  }

  Future<void> deleteAddress(String id) =>
      _api.delete('${ApiConfig.trips}/favorites/addresses/$id');
}
