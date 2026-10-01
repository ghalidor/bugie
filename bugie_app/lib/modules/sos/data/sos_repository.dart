import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';

/// Repositorio SOS.
/// Backend: SosController y endpoint /trips/sos en TripsController.
class SosRepository {
  final ApiClient _api;
  SosRepository(this._api);

  /// POST /api/sos
  /// Activa una alerta SOS durante un viaje.
  Future<String> activate({
    required String tripId,
    required double lat,
    required double lng,
  }) async {
    final json = await _api.post('${ApiConfig.trips}/sos', body: {
      'tripId': tripId,
      'lat': lat,
      'lng': lng,
    });
    return (json?['alertId'] ?? '').toString();
  }
}
