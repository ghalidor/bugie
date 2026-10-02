/// Estados del conductor (DriverStatus en el backend).
class DriverStatus {
  static const pendingDocs  = 1; // Falta subir documentos
  static const underReview  = 2; // Esperando aprobación admin
  static const approved     = 3; // Aprobado
  static const rejected     = 4;
  static const suspended    = 5;

  static String label(int s) {
    switch (s) {
      case pendingDocs:  return 'Documentos pendientes';
      case underReview:  return 'En revisión';
      case approved:     return 'Aprobado';
      case rejected:     return 'Rechazado';
      case suspended:    return 'Suspendido';
      default:           return 'Desconocido';
    }
  }
}

class Driver {
  final String id;
  final String userId;
  final int status;
  final bool isOnline;
  final double? rating;
  /// URL de la foto de perfil (subida por el conductor en /profile/me/photo).
  /// Viene como URL relativa del backend → resolver con ApiConfig.resolveMediaUrl.
  final String? profilePhotoUrl;
  final DateTime createdAt;

  Driver({
    required this.id,
    required this.userId,
    required this.status,
    required this.isOnline,
    this.rating,
    this.profilePhotoUrl,
    required this.createdAt,
  });

  factory Driver.fromJson(Map<String, dynamic> j) => Driver(
        id:         j['id'].toString(),
        userId:     j['userId']?.toString() ?? '',
        status:     (j['status'] ?? 1) as int,
        isOnline:   j['isOnline'] == true,
        rating:     (j['rating'] as num?)?.toDouble(),
        profilePhotoUrl: j['profilePhotoUrl'] as String?,
        createdAt:  DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );
}

/// Conductor cercano (endpoint /drivers/nearby).
class NearbyDriver {
  final String id;
  final double lat;
  final double lng;
  final double distanceKm;
  final double? rating;

  NearbyDriver({
    required this.id,
    required this.lat,
    required this.lng,
    required this.distanceKm,
    this.rating,
  });

  factory NearbyDriver.fromJson(Map<String, dynamic> j) => NearbyDriver(
        // El backend manda driverId (no "id")
        id: (j['driverId'] ?? j['id'] ?? '').toString(),
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
        distanceKm: (j['distanceKm'] as num? ?? 0).toDouble(),
        rating: (j['rating'] as num?)?.toDouble(),
      );
}
