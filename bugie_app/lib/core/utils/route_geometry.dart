import 'dart:math' as math;
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

/// Cálculos de geometría sobre una ruta (polilínea).
///
/// Para detectar si el conductor se está saliendo de la ruta planeada,
/// necesitamos la distancia MÍNIMA del punto del conductor a la polilínea
/// completa. Recorremos cada segmento, calculamos la distancia perpendicular
/// del punto al segmento, y nos quedamos con el mínimo.
///
/// Trabajamos en metros usando `Geolocator.distanceBetween` (que devuelve
/// metros sobre la esfera). Para tramos cortos (<10 km) la aproximación
/// "plana" de proyección sobre el segmento da error <1m, aceptable para
/// nuestro caso (umbral de 500m).
class RouteGeometry {
  /// Calcula la distancia (metros) del punto al segmento más cercano
  /// de la polilínea. Si la polilínea tiene <2 puntos, devuelve 0
  /// (no se puede calcular).
  ///
  /// Devuelve también el punto más cercano sobre la ruta, útil para
  /// dibujar una línea visual desde el conductor a la ruta.
  static ({double distanceMeters, LatLng nearestOnRoute}) nearestOnPolyline(
    LatLng point,
    List<LatLng> polyline,
  ) {
    if (polyline.length < 2) {
      return (distanceMeters: 0, nearestOnRoute: point);
    }

    double bestDist = double.infinity;
    LatLng bestPoint = polyline.first;

    for (int i = 0; i < polyline.length - 1; i++) {
      final a = polyline[i];
      final b = polyline[i + 1];
      final near = _nearestOnSegment(point, a, b);
      final d = Geolocator.distanceBetween(
        point.latitude, point.longitude,
        near.latitude, near.longitude,
      );
      if (d < bestDist) {
        bestDist = d;
        bestPoint = near;
      }
    }
    return (distanceMeters: bestDist, nearestOnRoute: bestPoint);
  }

  /// Devuelve el punto sobre el segmento [a, b] más cercano a `p`.
  /// Aproximación en plano local (suficiente para segmentos de ruta urbana).
  static LatLng _nearestOnSegment(LatLng p, LatLng a, LatLng b) {
    // Proyectamos lat/lng a metros relativos a `a` para evitar distorsión.
    // 1 grado de latitud ≈ 111.32 km. 1 grado de longitud varía con cos(lat).
    final latRef = a.latitude * math.pi / 180;
    final mPerDegLat = 111320.0;
    final mPerDegLng = 111320.0 * math.cos(latRef);

    double ax = 0, ay = 0;
    double bx = (b.longitude - a.longitude) * mPerDegLng;
    double by = (b.latitude - a.latitude) * mPerDegLat;
    double px = (p.longitude - a.longitude) * mPerDegLng;
    double py = (p.latitude - a.latitude) * mPerDegLat;

    final dx = bx - ax;
    final dy = by - ay;
    final lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) {
      // Segmento degenerado (a == b): el más cercano es `a`.
      return a;
    }
    // Parámetro t: proyección de p sobre la recta a→b, recortada [0,1].
    final t = (((px - ax) * dx + (py - ay) * dy) / lenSq).clamp(0.0, 1.0);
    final nx = ax + t * dx;
    final ny = ay + t * dy;

    // Volver a lat/lng
    return LatLng(
      a.latitude + ny / mPerDegLat,
      a.longitude + nx / mPerDegLng,
    );
  }
}