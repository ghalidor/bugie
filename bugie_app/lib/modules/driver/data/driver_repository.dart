import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../domain/driver_document_model.dart';
import '../domain/driver_model.dart';
import '../domain/vehicle_model.dart';

/// Repositorio de conductores (puerto 5003).
class DriverRepository {
  final ApiClient _api;
  DriverRepository(this._api);

  // ── Perfil ───────────────────────────────────────────────────────────────

  /// POST /api/drivers/register
  /// Crea perfil de conductor para el usuario logueado.
  Future<Driver> registerProfile() async {
    final json = await _api.post('${ApiConfig.drivers}/drivers/register');
    return Driver.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/drivers/me
  Future<Driver?> getMyProfile() async {
    final json = await _api.get('${ApiConfig.drivers}/drivers/me');
    if (json == null) return null;
    return Driver.fromJson(json as Map<String, dynamic>);
  }

  /// PUT /api/drivers/submit-review
  /// Envía documentos a revisión.
  Future<Driver> submitForReview() async {
    final json = await _api.put('${ApiConfig.drivers}/drivers/submit-review');
    return Driver.fromJson(json as Map<String, dynamic>);
  }

  // ── Disponibilidad ───────────────────────────────────────────────────────

  /// PUT /api/drivers/go-online
  Future<Driver> goOnline(double lat, double lng) async {
    final json = await _api.put(
      '${ApiConfig.drivers}/drivers/go-online',
      body: {'lat': lat, 'lng': lng},
    );
    return Driver.fromJson(json as Map<String, dynamic>);
  }

  /// PUT /api/drivers/go-offline
  Future<Driver> goOffline() async {
    final json = await _api.put('${ApiConfig.drivers}/drivers/go-offline');
    return Driver.fromJson(json as Map<String, dynamic>);
  }

  /// PUT /api/drivers/location
  /// El conductor manda su posición cada 5-10 segundos mientras está online.
  Future<void> updateLocation({
    required double lat,
    required double lng,
    String? tripId,
    double? speedKmh,
    double? heading,
  }) async {
    await _api.put('${ApiConfig.drivers}/drivers/location', body: {
      'lat': lat,
      'lng': lng,
      if (tripId   != null) 'tripId':   tripId,
      if (speedKmh != null) 'speedKmh': speedKmh,
      if (heading  != null) 'heading':  heading,
    });
  }

  // ── Vehículos ────────────────────────────────────────────────────────────

  /// POST /api/drivers/vehicles
  Future<Vehicle> addVehicle({
    required String plate,
    required String brand,
    required String model,
    required int year,
    required String color,
  }) async {
    final json = await _api.post('${ApiConfig.drivers}/drivers/vehicles', body: {
      'plate': plate,
      'brand': brand,
      'model': model,
      'year': year,
      'color': color,
    });
    return Vehicle.fromJson(json as Map<String, dynamic>);
  }

  /// PUT /api/drivers/vehicles/{vehicleId}/activate
  Future<Vehicle> activateVehicle(String vehicleId) async {
    final json = await _api.put(
      '${ApiConfig.drivers}/drivers/vehicles/$vehicleId/activate',
    );
    return Vehicle.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/drivers/vehicles/me — vehículo activo del conductor logueado.
  /// Devuelve null si todavía no tiene vehículo registrado.
  Future<Vehicle?> getMyVehicle() async {
    try {
      final json = await _api.get('${ApiConfig.drivers}/drivers/vehicles/me');
      return Vehicle.fromJson(json as Map<String, dynamic>);
    } on ApiException catch (e) {
      // 404: el conductor no tiene vehículo todavía. No es error.
      if (e.status == 404) return null;
      rethrow;
    }
  }

  /// POST /api/drivers/vehicles/me/photo — sube/reemplaza foto del vehículo.
  /// Devuelve la URL pública de la foto. Requiere vehículo registrado.
  Future<String> uploadMyVehiclePhoto(String filePath) async {
    final json = await _api.postMultipart(
      '${ApiConfig.drivers}/drivers/vehicles/me/photo',
      fields: {},
      filePath: filePath,
    );
    return (json as Map<String, dynamic>)['photoUrl'] as String? ?? '';
  }

  /// POST /api/drivers/profile/me/photo — sube/reemplaza la foto de PERFIL
  /// del conductor (distinta de la de verificación facial diaria).
  /// Devuelve la URL relativa para usar con ApiConfig.resolveMediaUrl.
  Future<String> uploadMyProfilePhoto(String filePath) async {
    final json = await _api.postMultipart(
      '${ApiConfig.drivers}/drivers/profile/me/photo',
      fields: {},
      filePath: filePath,
    );
    return (json as Map<String, dynamic>)['profilePhotoUrl'] as String? ?? '';
  }

  /// GET /api/drivers/documents/me/can-upload/{docType}
  /// Pregunta al backend si el conductor puede subir/reemplazar ese documento.
  /// Devuelve [canUpload, reason] — si canUpload es false, reason explica por qué.
  Future<({bool canUpload, String? reason, int? daysUntilExpiry})>
      canUploadDocument(String docType) async {
    try {
      final json = await _api.get(
        '${ApiConfig.drivers}/drivers/documents/me/can-upload/$docType',
      );
      final map = json as Map<String, dynamic>;
      return (
        canUpload: map['canUpload'] == true,
        reason: map['reason'] as String?,
        daysUntilExpiry: (map['daysUntilExpiry'] as num?)?.toInt(),
      );
    } catch (_) {
      // Si falla el preflight no bloqueamos al usuario: dejamos que intente
      // subir; el backend validará y devolverá el error real si aplica.
      return (canUpload: true, reason: null, daysUntilExpiry: null);
    }
  }

  // ── Conductores cercanos (lo usa el pasajero) ───────────────────────────

  /// GET /api/drivers/nearby
  Future<List<NearbyDriver>> getNearby({
    required double lat,
    required double lng,
    double radiusKm = 5,
    int maxResults = 10,
  }) async {
    final url =
        '${ApiConfig.drivers}/drivers/nearby?lat=$lat&lng=$lng&radiusKm=$radiusKm&maxResults=$maxResults';
    final json = await _api.get(url);
    final list = (json as List?) ?? [];
    return list
        .map((d) => NearbyDriver.fromJson(d as Map<String, dynamic>))
        .toList();
  }

  // ── Documentos del conductor ────────────────────────────────────────────

  /// GET /api/drivers/documents/me
  /// Devuelve los documentos ACTIVOS (sin histórico) del conductor logueado.
  Future<List<DriverDocument>> getMyDocuments() async {
    final json = await _api.get('${ApiConfig.drivers}/drivers/documents/me');
    final list = (json as List?) ?? [];
    return list
        .map((d) => DriverDocument.fromJson(d as Map<String, dynamic>))
        .toList();
  }

  /// POST /api/drivers/documents (multipart)
  /// Sube un documento. `expiresAt` solo es obligatorio para license/soat/revision_tecnica.
  Future<DriverDocument> uploadDocument({
    required String docType,
    required String filePath,
    DateTime? expiresAt,
  }) async {
    final fields = <String, String>{'docType': docType};
    if (expiresAt != null) {
      // El backend acepta DateTime ISO; mandamos formato yyyy-MM-dd para evitar
      // problemas de timezone.
      fields['expiresAt'] = expiresAt.toUtc().toIso8601String();
    }
    final json = await _api.postMultipart(
      '${ApiConfig.drivers}/drivers/documents',
      fields: fields,
      filePath: filePath,
    );
    return DriverDocument.fromJson(json as Map<String, dynamic>);
  }
}
