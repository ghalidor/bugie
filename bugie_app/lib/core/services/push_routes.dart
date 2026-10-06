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
  String? reasonCode,
}) {
  // Avisos de negociación que el backend manda sin ruta pero que deben
  // abrir algo al tocarlos.
  if (route == null || route.trim().isEmpty) {
    route = _defaultRouteFor(pushType, tripId, reasonCode);
  }
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
      _passengerTripTypes.contains(pushType)) {
    query['trip'] = tripId;
  }

  final target = Uri(path: path, queryParameters: query.isEmpty ? null : query)
      .toString();
  return routeExists(router, target) ? target : home;
}

/// Avisos al pasajero que abren el seguimiento de ESE viaje (?trip=<id>):
/// así también funciona con un programado que todavía no es el viaje activo.
const _passengerTripTypes = {
  'scheduled_reminder',
  'scheduled_no_driver',
  'driver_assigned',
  'driver_no_confirm',
  'offer_driver_busy',
  'offer_withdrawn',
  'trip_reopened',
  'trip_cancelled',
};

/// Ruta para avisos que llegan sin data.route.
///  - offer_not_chosen / confirm_expired (conductor) → Solicitudes.
///  - acceptance_undone (conductor) → la solicitud.
///  - trip_cancelled por no_driver_timeout (pasajero) → seguimiento de ese
///    viaje, que muestra "Nadie aceptó tu pedido…" con el botón para volver
///    a pedirlo.
String? _defaultRouteFor(String? pushType, String? tripId, String? reasonCode) {
  final hasTrip = tripId != null && tripId.isNotEmpty;
  switch (pushType) {
    case 'offer_not_chosen':
    case 'confirm_expired':
      return '/driver/requests';
    case 'acceptance_undone':
      return hasTrip ? '/driver/incoming/$tripId' : '/driver/requests';
    case 'trip_cancelled':
      return reasonCode == 'no_driver_timeout' ? '/passenger/tracking' : null;
    default:
      return null;
  }
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
