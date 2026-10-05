import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';

/// Zona con pedidos recientes (para pintar círculos en el mapa del inicio).
class DemandZone {
  final double lat;
  final double lng;
  final int count;
  final int deliveries;
  final int trips;

  const DemandZone({
    required this.lat,
    required this.lng,
    required this.count,
    required this.deliveries,
    required this.trips,
  });

  factory DemandZone.fromJson(Map<String, dynamic> j) => DemandZone(
        lat: (j['lat'] as num? ?? 0).toDouble(),
        lng: (j['lng'] as num? ?? 0).toDouble(),
        count: (j['count'] as num? ?? 0).toInt(),
        deliveries: (j['deliveries'] as num? ?? 0).toInt(),
        trips: (j['trips'] as num? ?? 0).toInt(),
      );
}

/// Solicitud cercana al conductor (pin en el mapa).
class NearbyRequest {
  final String id;

  /// 0 = viaje, 1 = envío.
  final int serviceType;
  final double originLat;
  final double originLng;
  final String originAddress;
  final String destAddress;
  final double estimatedFare;
  final double? distanceKm;
  final DateTime? createdAt;

  const NearbyRequest({
    required this.id,
    required this.serviceType,
    required this.originLat,
    required this.originLng,
    required this.originAddress,
    required this.destAddress,
    required this.estimatedFare,
    this.distanceKm,
    this.createdAt,
  });

  bool get isDelivery => serviceType == 1;

  factory NearbyRequest.fromJson(Map<String, dynamic> j) => NearbyRequest(
        id: '${j['id'] ?? ''}',
        serviceType: (j['serviceType'] as num? ?? 0).toInt(),
        originLat: (j['originLat'] as num? ?? 0).toDouble(),
        originLng: (j['originLng'] as num? ?? 0).toDouble(),
        originAddress: '${j['originAddress'] ?? ''}',
        destAddress: '${j['destAddress'] ?? ''}',
        estimatedFare: (j['estimatedFare'] as num? ?? 0).toDouble(),
        distanceKm: (j['distanceKm'] as num?)?.toDouble(),
        createdAt: DateTime.tryParse('${j['createdAt'] ?? ''}'),
      );
}

/// Respuesta de GET {trips}/trips/driver/demand.
class DriverDemand {
  final DateTime? generatedAt;
  final List<DemandZone> zones;
  final List<NearbyRequest> nearby;

  const DriverDemand({
    this.generatedAt,
    this.zones = const [],
    this.nearby = const [],
  });

  factory DriverDemand.fromJson(Map<String, dynamic> j) => DriverDemand(
        generatedAt: DateTime.tryParse('${j['generatedAt'] ?? ''}'),
        zones: ((j['zones'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(DemandZone.fromJson)
            .toList(),
        nearby: ((j['nearby'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(NearbyRequest.fromJson)
            .where((r) => r.id.isNotEmpty)
            .toList(),
      );
}

/// Consulta de demanda para el mapa del inicio del conductor.
class DriverDemandApi {
  final ApiClient _api;
  DriverDemandApi(this._api);

  /// GET {trips}/trips/driver/demand?lat=&lng=&radiusKm=
  Future<DriverDemand> get({
    required double lat,
    required double lng,
    double radiusKm = 10,
  }) async {
    final json = await _api.get(
      '${ApiConfig.trips}/trips/driver/demand'
      '?lat=$lat&lng=$lng&radiusKm=$radiusKm',
    );
    if (json is! Map<String, dynamic>) return const DriverDemand();
    return DriverDemand.fromJson(json);
  }
}
