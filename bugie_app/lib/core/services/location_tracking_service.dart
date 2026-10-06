import 'dart:async';
import 'package:geolocator/geolocator.dart';

/// Modo del tracking. Define la frecuencia base.
/// El throttle por distancia se aplica encima.
enum TrackingMode {
  /// Conductor online sin viaje. GPS cada 30s; cada punto se envía al toque.
  driverIdle,

  /// Conductor en un viaje (camino al pasajero o viaje en curso). GPS cada 5s;
  /// los puntos se acumulan y se envían en lote (ver [LocationTrackingService]).
  driverInTrip,

  /// Pasajero esperando que el conductor llegue. Cada 30s.
  passengerWaiting,

  /// Pasajero durante el viaje. Cada 10s.
  passengerInTrip,
}

/// Un punto GPS listo para enviarse al backend en lote.
class TrackedPoint {
  final double lat;
  final double lng;
  final double? speedKmh;
  final double? heading;

  /// Momento en que el celular tomó el punto (instante real, en UTC).
  /// Al serializar se convierte a hora de Perú sin zona.
  final DateTime recordedAtUtc;

  TrackedPoint({
    required this.lat,
    required this.lng,
    this.speedKmh,
    this.heading,
    required this.recordedAtUtc,
  });

  factory TrackedPoint.fromPosition(Position pos) {
    // Algunos equipos devuelven -1 cuando no conocen velocidad o rumbo.
    final speed = pos.speed >= 0 ? pos.speed * 3.6 : null;
    final heading = pos.heading >= 0 ? pos.heading : null;
    return TrackedPoint(
      lat: pos.latitude,
      lng: pos.longitude,
      speedKmh: speed,
      heading: heading,
      recordedAtUtc: DateTime.now().toUtc(),
    );
  }

  /// Hora de Perú (UTC-5, sin horario de verano) como "yyyy-MM-ddTHH:mm:ss",
  /// igual que las demás fechas que la app manda a la API.
  String get recordedAtApi {
    final p = recordedAtUtc.subtract(const Duration(hours: 5));
    String two(int n) => n.toString().padLeft(2, '0');
    return '${p.year.toString().padLeft(4, '0')}-${two(p.month)}-${two(p.day)}'
        'T${two(p.hour)}:${two(p.minute)}:${two(p.second)}';
  }

  Map<String, dynamic> toJson() => {
        'lat': lat,
        'lng': lng,
        if (speedKmh != null) 'speedKmh': speedKmh,
        if (heading != null) 'heading': heading,
        'recordedAt': recordedAtApi,
      };
}

/// Servicio único de tracking de ubicación para conductor y pasajero.
///
/// Estrategia combinada (A + B):
///   - A. **Frecuencia adaptativa**: cada modo tiene su intervalo base.
///   - B. **Throttle por movimiento**: sólo cuenta un punto si movió ≥20m
///     DESDE el último punto aceptado, O si pasaron ≥60s (heartbeat).
///
/// Dos formas de enviar:
///   - `sender` (1 punto): se llama apenas el punto pasa el filtro. Lo usa
///     el pasajero.
///   - `batchSender` (lista de puntos): los puntos pasan a una cola local y
///     se envían en lote. Lo usa el conductor:
///       · driverInTrip: lote cada [batchFlushInterval] o al juntar
///         [batchSize] puntos.
///       · driverIdle: se envía apenas hay un punto (lote de 1).
///     Si no hay red o falla el envío, los puntos se quedan en la cola
///     (tope [maxQueuedPoints], se descartan los más viejos) y se reintentan
///     en el siguiente ciclo. [flush] vacía la cola antes de parar.
///
/// USO:
///   final svc = LocationTrackingService();
///   svc.start(mode: TrackingMode.driverIdle, batchSender: (points) async {
///     await driverRepo.updateLocationBatch(points: points);
///   });
///   svc.setMode(TrackingMode.driverInTrip);
///   await svc.flushAndStop();
class LocationTrackingService {
  /// Distancia mínima en metros para que un movimiento cuente como
  /// "movimiento real". Menos que esto es ruido del GPS.
  static const double minMovementMeters = 20;

  /// Cada cuánto aceptamos un punto aunque no nos movamos (heartbeat).
  /// Sirve para que el admin sepa "sigue conectado, sigue en X lugar".
  static const Duration heartbeatInterval = Duration(seconds: 60);

  /// En viaje: cada cuánto se envía el lote acumulado.
  static const Duration batchFlushInterval = Duration(seconds: 12);

  /// En viaje: al juntar esta cantidad de puntos se envía sin esperar.
  static const int batchSize = 5;

  /// Máximo de puntos por request (límite del backend).
  static const int maxPointsPerRequest = 50;

  /// Tope de la cola local. Si se pasa, se descartan los más viejos.
  static const int maxQueuedPoints = 500;

  /// Tiempo máximo que esperamos al vaciar la cola antes de parar.
  static const Duration flushTimeout = Duration(seconds: 4);

  TrackingMode? _mode;
  Timer? _timer;
  Timer? _flushTimer;
  Position? _lastAccepted;
  DateTime? _lastAcceptedAt;
  bool _isRunning = false;

  /// Envío de 1 punto (pasajero). Lo inyecta el caller.
  Future<void> Function(Position pos)? _sender;

  /// Envío en lote (conductor). Lo inyecta el caller.
  Future<void> Function(List<TrackedPoint> points)? _batchSender;

  /// Cola local de puntos pendientes de envío (solo con [_batchSender]).
  final List<TrackedPoint> _queue = [];

  /// Flush en curso (para encadenar y no mandar dos lotes a la vez).
  Future<void>? _inFlight;

  /// Función opcional para logear/notificar errores. Sin esto los errores
  /// son silenciosos (mejor para producción).
  void Function(Object error)? onError;

  bool get isRunning => _isRunning;
  TrackingMode? get mode => _mode;

  /// Puntos que todavía no se pudieron enviar.
  int get pendingCount => _queue.length;

  /// Última posición GPS aceptada por el filtro (sin esperar el envío).
  /// Las pantallas la usan para pintar el pin propio sin pedir GPS de nuevo.
  /// Puede ser null si el servicio aún no obtuvo ninguna posición.
  Position? get lastKnownPosition => _lastAccepted;
  DateTime? get lastKnownPositionAt => _lastAcceptedAt;

  /// Inicia el tracking en el modo dado. Hay que pasar [sender] o
  /// [batchSender]. Hace un primer intento inmediato y luego se reagenda.
  ///
  /// Si ya había puntos en cola de un ciclo anterior, se intentan enviar con
  /// el sender anterior (por ejemplo, con el tripId del viaje que terminó)
  /// antes de reemplazarlo.
  void start({
    required TrackingMode mode,
    Future<void> Function(Position pos)? sender,
    Future<void> Function(List<TrackedPoint> points)? batchSender,
  }) {
    assert(sender != null || batchSender != null,
        'LocationTrackingService.start necesita sender o batchSender');
    // Si ya estaba corriendo, cancelamos el ciclo anterior para no tener
    // dos timers enviando a la vez.
    _timer?.cancel();
    _flushTimer?.cancel();
    _flushTimer = null;

    final previous = _batchSender;
    if (previous != null && _queue.isNotEmpty && previous != batchSender) {
      unawaited(_flushWith(previous));
    }

    _mode = mode;
    _sender = sender;
    _batchSender = batchSender;
    _isRunning = true;
    _scheduleFlushTimer();
    _tick(); // primer punto inmediato
  }

  /// Cambia el modo en caliente (ej: conductor pasa de online a en-viaje).
  /// El próximo tick usa el nuevo intervalo.
  void setMode(TrackingMode mode) {
    if (!_isRunning) return;
    if (_mode == mode) return;
    _mode = mode;
    // Reagendar con el nuevo intervalo lo antes posible.
    _timer?.cancel();
    _scheduleFlushTimer();
    _tick();
  }

  /// Para el tracking. Llamar al ir offline, completar viaje, dispose, etc.
  /// Descarta lo que quede en cola: si hace falta enviarlo, usar [flush] o
  /// [flushAndStop] antes.
  void stop() {
    _timer?.cancel();
    _timer = null;
    _flushTimer?.cancel();
    _flushTimer = null;
    _isRunning = false;
    _mode = null;
    _sender = null;
    _batchSender = null;
    _queue.clear();
    _lastAccepted = null;
    _lastAcceptedAt = null;
  }

  /// Envía lo pendiente en la cola (en tandas de [maxPointsPerRequest]).
  /// Nunca lanza: si no hay red o se pasa el [timeout], los puntos que no
  /// salieron se quedan en la cola para el siguiente ciclo.
  Future<void> flush({Duration timeout = flushTimeout}) async {
    final sender = _batchSender;
    if (sender == null || _queue.isEmpty) return;
    try {
      await _flushWith(sender).timeout(timeout);
    } on TimeoutException {
      // El request sigue en el fondo; si llega, el próximo flush ya no
      // encuentra esos puntos... pero si no llegó, se reintentan. Aceptable
      // para un cierre: preferimos no colgar la pantalla.
    } catch (e) {
      onError?.call(e);
    }
  }

  /// Vacía la cola (con timeout corto) y luego para el tracking.
  Future<void> flushAndStop({Duration timeout = flushTimeout}) async {
    await flush(timeout: timeout);
    stop();
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

  /// Solo en viaje con envío en lote hay un timer periódico de flush.
  /// En los demás modos el punto se envía apenas se acepta.
  void _scheduleFlushTimer() {
    _flushTimer?.cancel();
    _flushTimer = null;
    if (_batchSender == null || _mode != TrackingMode.driverInTrip) return;
    _flushTimer = Timer.periodic(batchFlushInterval, (_) {
      if (_queue.isNotEmpty) unawaited(_flushQueue());
    });
  }

  /// Decide si el punto actual cuenta como movimiento real.
  /// Criterio: ≥20m desde el último aceptado, O ≥60s desde el último aceptado.
  bool _shouldAccept(Position current) {
    final last = _lastAccepted;
    final lastAt = _lastAcceptedAt;
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

  /// Un tick del ciclo: obtiene posición, decide si cuenta, envía o encola,
  /// y reagenda.
  Future<void> _tick() async {
    if (!_isRunning || _mode == null) return;
    if (_sender == null && _batchSender == null) return;

    try {
      final pos = await Geolocator.getCurrentPosition(
        // Accuracy media: balance entre precisión y batería.
        // No necesitamos accuracy.best para mostrar un pin en el mapa.
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
        ),
      );
      // Pudo pararse mientras esperábamos el GPS.
      if (!_isRunning) return;

      if (_shouldAccept(pos)) {
        // El pin propio usa esta posición al toque, sin esperar el envío.
        _lastAccepted = pos;
        _lastAcceptedAt = DateTime.now();

        if (_batchSender != null) {
          _enqueue(TrackedPoint.fromPosition(pos));
          // Sin viaje: lote de 1, al toque. En viaje: cuando se junten
          // [batchSize] puntos (o lo dispare el timer de flush).
          if (_mode != TrackingMode.driverInTrip || _queue.length >= batchSize) {
            await _flushQueue();
          }
        } else {
          await _sender!(pos);
        }
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

  void _enqueue(TrackedPoint p) {
    _queue.add(p);
    if (_queue.length > maxQueuedPoints) {
      _queue.removeRange(0, _queue.length - maxQueuedPoints);
    }
  }

  /// Flush con el sender actual (reporta errores por [onError]).
  Future<void> _flushQueue() async {
    final sender = _batchSender;
    if (sender == null) return;
    try {
      await _flushWith(sender);
    } catch (e) {
      onError?.call(e);
    }
  }

  /// Envía la cola en tandas de [maxPointsPerRequest] usando [sender].
  /// Quita de la cola solo lo que se confirmó enviado; si una tanda falla,
  /// lanza y lo que falta queda para el siguiente ciclo.
  /// Los flush se encadenan: nunca hay dos requests de lote a la vez.
  Future<void> _flushWith(
    Future<void> Function(List<TrackedPoint> points) sender,
  ) {
    final previous = _inFlight;
    late final Future<void> run;
    run = () async {
      if (previous != null) {
        // El error del flush anterior ya lo reportó quien lo lanzó.
        try { await previous; } catch (_) {}
      }
      while (_queue.isNotEmpty) {
        final n = _queue.length < maxPointsPerRequest
            ? _queue.length
            : maxPointsPerRequest;
        final chunk = List<TrackedPoint>.unmodifiable(_queue.take(n));
        await sender(chunk);
        // Por identidad: mientras esperábamos pudieron entrar puntos nuevos
        // (al final) o descartarse viejos por el tope (al inicio).
        _queue.removeWhere((p) => chunk.any((c) => identical(c, p)));
      }
    }();
    _inFlight = run;
    run.whenComplete(() {
      if (identical(_inFlight, run)) _inFlight = null;
    }).ignore();
    return run;
  }
}
