/// Error devuelto por cualquier API del backend Bugie.
/// Equivalente al ApiError del web (state/api.ts).
///
/// Distinguimos errores HTTP "normales" (status 4xx/5xx) de errores
/// de red (timeout, sin conexión). Esto permite a las pantallas:
///   - Mostrar el mensaje del backend cuando es un 4xx/5xx.
///   - Mostrar un banner "Sin conexión" y reintentar cuando es de red.
class ApiException implements Exception {
  /// Código HTTP. 0 = error de red (timeout, host inalcanzable).
  final int status;
  final String message;

  /// Cuerpo JSON del error, con los campos extra que manda el backend
  /// además de `error` (ej. waitingTripId, proposalId). null si no hay.
  final Map<String, dynamic>? data;

  ApiException(this.status, this.message, {this.data});

  /// Campo extra del cuerpo del error como texto (null si no viene).
  String? field(String key) => data?[key]?.toString();

  /// Errores de red (no llegamos a obtener respuesta del servidor).
  /// status = 0. Las pantallas pueden detectarlos con `isNetwork`.
  factory ApiException.network(String message) => ApiException(0, message);

  bool get isNetwork => status == 0;

  @override
  String toString() => 'ApiException($status): $message';
}