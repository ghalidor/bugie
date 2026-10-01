import 'dart:async';
import 'package:geolocator/geolocator.dart';

/// Modo del tracking. Define la frecuencia base.
/// El throttle por distancia se aplica encima.
enum TrackingMode {
  /// Conductor online sin viaje. Envío cada 30s con heartbeat.
  driverIdle,

  /// Conductor en un viaje (camino al pasajero o viaje en curso). Cada 5s.
  driverInTrip,

  /// Pasajero esperando que el conductor llegue. Cada 30s.
  passengerWaiting,

  /// Pasajero durante el viaje. Cada 10s.
  passengerInTrip,
}

/// Servicio único de tracking de ubicación para conductor y pasajero.
///
/// Estrategia combinada (A + B):
///   - A. **Frecuencia adaptativa**: cada modo tiene su intervalo base.
///   - B. **Throttle por movimiento**: sólo envía si movió ≥20m DESDE
///     el último envío, O si pasaron ≥60s sin enviar (heartbeat).
///
/// Esto reduce ~95% el tráfico de tracking vs "todos cada 3s".
///
/// USO:
///   final svc = LocationTrackingService();
///   svc.start(mode: TrackingMode.driverIdle, sender: (pos) async {
///     await driverRepo.updateLocation(lat: pos.latitude, ...);
///   });
///   // ... cuando cambia el contexto:
///   svc.setMode(TrackingMode.driverInTrip);
///   // ... al detener:
///   svc.stop();
class LocationTrackingService {
  /// Distancia mínima en metros para que un movimiento cuente como
  /// "movimiento real". Menos que esto es ruido del GPS.
  static const double minMovementMeters = 20;

  /// Cada cuánto enviamos aunque no nos movamos (heartbeat).
  /// Sirve para que el admin sepa "sigue conectado, sigue en X lugar".
  static const Duration heartbeatInterval = Duration(seconds: 60);

  TrackingMode? _mode;
  Timer? _timer;
  Position? _lastSent;
  DateTime? _lastSentAt;
  bool _isRunning = false;

  /// Función que envía la posición al backend. La inyecta el caller para
  /// que cada actor (conductor/pasajero) use su propio endpoint.
  Future<void> Function(Position pos)? _sender;

  /// Función opcional para logear/notificar errores. Sin esto los errores
  /// son silenciosos (mejor para producción).
  void Function(Object error)? onError;

  bool get isRunning => _isRunning;
  TrackingMode? get mode => _mode;

  /// Última posición enviada al backend. Útil para que las pantallas
  /// muestren la posición actual del usuario sin pedir GPS de nuevo.
  /// Puede ser null si el servicio nunca envió nada todavía.
  Position? get lastKnownPosition => _lastSent;
  DateTime? get lastKnownPositionAt => _lastSentAt;

  /// Inicia el tracking en el modo dado.
  /// Hace un primer intento inmediato y luego se reagenda según el modo.
  void start({
    required TrackingMode mode,
    required Future<void> Function(Position pos) sender,
  }) {
    _mode = mode;
    _sender = sender;
    _isRunning = true;
    _tick(); // primer envío inmediato
  }

  /// Cambia el modo en caliente (ej: conductor pasa de online a en-viaje).
  /// El próximo tick usa el nuevo intervalo.
  void setMode(TrackingMode mode) {
    if (!_isRunning) return;
    if (_mode == mode) return;
    _mode = mode;
    // Reagendar con el nuevo intervalo lo antes posible.
    _timer?.cancel();
    _tick();
  }

  /// Para el tracking. Llamar al ir offline, completar viaje, dispose, etc.
  void stop() {
    _timer?.cancel();
    _timer = null;
    _isRunning = false;
    _mode = null;
    _sender = null;
    _lastSent = null;
    _lastSentAt = null;
  }

  /// Intervalo base según el modo actual.
  Duration _intervalFor(TrackingMode m) {
    switch (m) {
      case TrackingMode.driverIdle:       return const Duration(seconds: 30);
      case TrackingMode.driverInTrip:     return const Duration(seconds: 5);
      case TrackingMode.passengerWaiting: return const Duration(seconds: 30);
      case TrackingMode.passengerInTrip:  return const Duration(seconds: 10);
    }
  }

  /// Decide si debe enviar la posición actual al backend.
  /// Criterio: ≥20m de movimiento, O ≥60s desde el último envío.
  bool _shouldSend(Position current) {
    final last = _lastSent;
    final lastAt = _lastSentAt;
    if (last == null || lastAt == null) return true; // primera vez

    final distance = Geolocator.distanceBetween(
      last.latitude, last.longitude,
      current.latitude, current.longitude,
    );
    if (distance >= minMovementMeters) return true;

    final elapsed = DateTime.now().difference(lastAt);
    if (elapsed >= heartbeatInterval) return true;

    return false;
  }

  /// Un tick del ciclo: obtiene posición, decide si enviar, reagenda.
  Future<void> _tick() async {
    if (!_isRunning || _mode == null || _sender == null) return;

    try {
      final pos = await Geolocator.getCurrentPosition(
        // Accuracy media: balance entre precisión y batería.
        // No necesitamos accuracy.best para mostrar un pin en el mapa.
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
        ),
      );

      if (_shouldSend(pos)) {
        await _sender!(pos);
        _lastSent = pos;
        _lastSentAt = DateTime.now();
      }
    } catch (e) {
      // No reventar el ciclo por una falla puntual (GPS no disponible,
      // permisos, red caída, etc.). El siguiente tick lo intentará de nuevo.
      onError?.call(e);
    } finally {
      // Reagenda solo si seguimos corriendo y el modo no cambió a nada raro.
      if (_isRunning && _mode != null) {
        _timer = Timer(_intervalFor(_mode!), _tick);
      }
    }
  }
}
