import '../../../core/api/api_config.dart';

/// Tipos de foto de un envío (enum TripPhotoKind del backend Trips).
class TripPhotoKind {
  static const package         = 0; // Foto del paquete (la sube el cliente)
  static const pickupMain      = 1; // Recojo: foto principal (conductor)
  static const pickupSecondary = 2; // Recojo: fotos adicionales (conductor)
  static const delivery        = 3; // Prueba de entrega en destino

  /// Etiqueta corta para mostrar sobre cada foto.
  static String label(int kind) {
    switch (kind) {
      case package:         return 'Paquete';
      case pickupMain:      return 'Recojo';
      case pickupSecondary: return 'Recojo (adicional)';
      case delivery:        return 'Entrega';
      default:              return 'Foto';
    }
  }
}

/// Una foto de un viaje/envío. GET /api/trips/{id}/photos.
class TripPhoto {
  final String id;
  /// URL tal como la manda el backend (normalmente RELATIVA: /uploads/trips/...).
  final String url;
  final int kind;
  final DateTime? createdAt;

  TripPhoto({
    required this.id,
    required this.url,
    required this.kind,
    this.createdAt,
  });

  /// URL lista para Image.network. Las fotos las sirve la API de Trips.
  String get fullUrl =>
      ApiConfig.resolveMediaUrl(url, service: ApiService.trips) ?? url;

  String get label => TripPhotoKind.label(kind);

  factory TripPhoto.fromJson(Map<String, dynamic> j) => TripPhoto(
        id:        (j['id'] ?? '').toString(),
        url:       (j['url'] ?? '').toString(),
        kind:      (j['kind'] as num?)?.toInt() ?? 0,
        createdAt: DateTime.tryParse(j['createdAt']?.toString() ?? ''),
      );
}
