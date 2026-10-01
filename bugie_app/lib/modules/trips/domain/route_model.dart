import 'package:latlong2/latlong.dart';

/// Información de una ruta calculada por el backend.
/// Devuelta por GET /api/trips/route y POST /api/trips/route/waypoints.
class RouteInfo {
  final double distanceKm;
  final double durationMinutes;
  final bool isFallback;
  final List<RouteOption> options;

  RouteInfo({
    required this.distanceKm,
    required this.durationMinutes,
    this.isFallback = false,
    this.options = const [],
  });

  factory RouteInfo.fromJson(Map<String, dynamic> j) {
    final options = (j['options'] as List?)
            ?.map((o) => RouteOption.fromJson(o as Map<String, dynamic>))
            .toList() ??
        [];
    return RouteInfo(
      distanceKm:      (j['distanceKm'] as num? ?? 0).toDouble(),
      durationMinutes: (j['durationMinutes'] as num? ?? 0).toDouble(),
      isFallback:      j['isFallback'] == true,
      options:         options,
    );
  }
}

class RouteOption {
  final double distanceKm;
  final double durationMinutes;
  /// Lista de puntos [lng, lat] (¡ojo, así viene del backend!)
  final List<LatLng> coordinates;

  RouteOption({
    required this.distanceKm,
    required this.durationMinutes,
    required this.coordinates,
  });

  factory RouteOption.fromJson(Map<String, dynamic> j) {
    final coords = (j['coordinates'] as List?) ?? [];
    final points = coords.map((c) {
      // Backend devuelve [lng, lat]
      final list = c as List;
      return LatLng(
        (list[1] as num).toDouble(),
        (list[0] as num).toDouble(),
      );
    }).toList();
    return RouteOption(
      distanceKm:      (j['distanceKm'] as num? ?? 0).toDouble(),
      durationMinutes: (j['durationMinutes'] as num? ?? 0).toDouble(),
      coordinates:     points,
    );
  }
}
