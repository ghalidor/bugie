import 'package:go_router/go_router.dart';
import '../session/session.dart';

/// Normaliza la ruta que manda el backend en un push (data.route) para que
/// SIEMPRE apunte a una pantalla que existe en app_router.dart y que
/// corresponde al rol del usuario logueado.
///
/// Reglas:
///   - Ruta sin prefijo de rol (ej. "/rewards", que manda Rewards) → se le
///     pone el prefijo del rol actual: "/driver/rewards" o "/passenger/rewards".
///   - Ruta con el prefijo del OTRO rol → se cambia al rol actual.
///   - "/passenger/trip-detail" necesita el viaje en memoria (extra) y no
///     se puede abrir desde un push → "/passenger/trips".
///   - Recordatorios de programados al pasajero → se agrega ?trip=<id> para
///     abrir el seguimiento de ESE viaje.
///   - Si la ruta resultante no existe en el router → inicio del rol.
///
/// Devuelve null si no hay ruta o no hay rol (sin sesión).
String? resolvePushRoute({
  required GoRouter? router,
  required UserRole? role,
  required String? route,
  String? pushType,
  String? tripId,
}) {
  if (route == null || route.trim().isEmpty) return null;
  final home = _homeFor(role);
  if (home == null) return null;

  var uri = Uri.tryParse(route.trim());
  if (uri == null) return home;
  var path = uri.path.startsWith('/') ? uri.path : '/${uri.path}';

  // Ajustar el prefijo del rol.
  if (path == '/driver' || path.startsWith('/driver/')) {
    path = home + path.substring('/driver'.length);
  } else if (path == '/passenger' || path.startsWith('/passenger/')) {
    path = home + path.substring('/passenger'.length);
  } else {
    path = path == '/' ? home : '$home$path';
  }

  // Pantallas que no se pueden abrir sin datos en memoria.
  if (path == '/passenger/trip-detail') path = '/passenger/trips';

  final query = Map<String, String>.from(uri.queryParameters);
  if (path == '/passenger/tracking' &&
      tripId != null &&
      tripId.isNotEmpty &&
      (pushType == 'scheduled_reminder' || pushType == 'scheduled_no_driver')) {
    query['trip'] = tripId;
  }

  final target = Uri(path: path, queryParameters: query.isEmpty ? null : query)
      .toString();
  return routeExists(router, target) ? target : home;
}

/// true si la ruta tiene una pantalla registrada en el router.
bool routeExists(GoRouter? router, String location) {
  if (router == null) return true; // sin router no podemos validar
  try {
    return router.configuration.findMatch(Uri.parse(location)).isNotEmpty;
  } catch (_) {
    return false;
  }
}

String? _homeFor(UserRole? role) {
  switch (role) {
    case UserRole.driver:
      return '/driver';
    case UserRole.passenger:
      return '/passenger';
    case UserRole.admin:
    case null:
      return null;
  }
}
