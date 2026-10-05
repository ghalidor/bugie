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

/// Un tramo de la ruta planificada por el sistema
/// (GET /api/trips/{id}/planned-route → pickup / trip).
class PlannedRouteLeg {
  /// 'graphhopper' o 'straight' (línea recta si GraphHopper no respondió).
  final String source;
  final List<LatLng> points;
  final double? distanceMeters;

  const PlannedRouteLeg({
    required this.source,
    required this.points,
    this.distanceMeters,
  });

  double? get distanceKm =>
      distanceMeters == null ? null : distanceMeters! / 1000;

  /// Los puntos vienen como [[lat, lng], ...].
  static PlannedRouteLeg? fromJson(dynamic j) {
    if (j is! Map<String, dynamic>) return null;
    final pts = <LatLng>[];
    for (final p in (j['points'] as List? ?? const [])) {
      if (p is List && p.length >= 2) {
        pts.add(LatLng((p[0] as num).toDouble(), (p[1] as num).toDouble()));
      }
    }
    return PlannedRouteLeg(
      source: j['source'] as String? ?? 'straight',
      points: pts,
      distanceMeters: (j['distanceMeters'] as num?)?.toDouble(),
    );
  }
}

/// Ruta del sistema de un viaje: tramo conductor → recogida ([pickup]) y
/// recogida → destino ([trip]). Ambos son null en viajes antiguos.
class PlannedRoute {
  final PlannedRouteLeg? pickup;
  final PlannedRouteLeg? trip;

  const PlannedRoute({this.pickup, this.trip});

  factory PlannedRoute.fromJson(Map<String, dynamic> j) => PlannedRoute(
        pickup: PlannedRouteLeg.fromJson(j['pickup']),
        trip: PlannedRouteLeg.fromJson(j['trip']),
      );
}

/// Recorrido GPS real del conductor en un viaje
/// (GET /api/trips/{id}/real-path).
class RealPath {
  final List<LatLng> points;
  final double distanceKm;

  const RealPath({required this.points, required this.distanceKm});

  factory RealPath.fromJson(Map<String, dynamic> j) {
    final pts = <LatLng>[];
    for (final p in (j['path'] as List? ?? const [])) {
      if (p is Map<String, dynamic> && p['lat'] is num && p['lng'] is num) {
        pts.add(LatLng((p['lat'] as num).toDouble(),
            (p['lng'] as num).toDouble()));
      }
    }
    return RealPath(
      points: pts,
      distanceKm: (j['distanceKm'] as num? ?? 0).toDouble(),
    );
  }
}
