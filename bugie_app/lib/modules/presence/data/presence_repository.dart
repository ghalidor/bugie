import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/presence_check_in_model.dart';

/// Repositorio para el módulo de presence check-in del conductor.
/// Vive en Drivers API (puerto 5003).
class PresenceRepository {
  final ApiClient _api;
  PresenceRepository(this._api);

  /// Sube la selfie de verificación facial al backend y crea el registro.
  /// El conductor queda autorizado para llamar a "go-online" después de esto.
  ///
  /// [filePath] = ruta al JPG temporal generado por la cámara local.
  /// [faceQualityScore] = score 0-1 que devolvió ML Kit (informativo).
  Future<PresenceCheckIn> checkIn({
    required String filePath,
    double? faceQualityScore,
  }) async {
    final fields = <String, String>{};
    if (faceQualityScore != null) {
      fields['faceQualityScore'] = faceQualityScore.toStringAsFixed(3);
    }
    final json = await _api.postMultipart(
      '${ApiConfig.drivers}/drivers/me/presence/checkin',
      fields: fields,
      filePath: filePath,
    );
    return PresenceCheckIn.fromJson(json as Map<String, dynamic>);
  }

  /// Cierra el check-in activo del conductor (al desconectarse).
  /// Idempotente: si no hay activo, no falla.
  Future<void> checkOut() =>
      _api.post('${ApiConfig.drivers}/drivers/me/presence/checkout');

  /// Devuelve el check-in activo del conductor si tiene uno, o null si no.
  /// Útil al abrir la app — restaurar el preview si seguía online.
  Future<PresenceCheckIn?> getActive() async {
    final json = await _api.get('${ApiConfig.drivers}/drivers/me/presence/active');
    final active = (json as Map<String, dynamic>)['active'];
    if (active == null) return null;
    return PresenceCheckIn.fromJson(active as Map<String, dynamic>);
  }
}
