import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../modules/trips/data/trips_repository.dart';
import '../../modules/trips/domain/trip_model.dart';
import '../session/session.dart';
import 'trips_hub_service.dart';

/// Viaje activo del usuario.
///  - Conductor: aceptado / en curso / SOS.
///  - Pasajero: cualquier viaje vigente (buscando, negociando, aceptado, en
///    curso, SOS), aunque lo haya creado desde la web.
///
/// Usa la consulta existente GET /trips/active. Se refresca:
///  - al iniciar sesión,
///  - al volver la app a primer plano,
///  - cada [_period] mientras la app está abierta,
///  - cuando llega un push (FcmService llama a [refresh]),
///  - pasajero: con los eventos del hub de su viaje y sus avisos,
///  - cuando alguna pantalla lo pide (Solicitudes en su consulta, la
///    pantalla del viaje al cerrarse).
///
/// Lo escuchan la franja "Viaje en curso · Volver" (ActiveTripFrame) y la
/// pantalla de Solicitudes del conductor (bloquea aceptar/proponer mientras
/// haya viaje).
class ActiveTripService with WidgetsBindingObserver {
  static final ActiveTripService _instance = ActiveTripService._();
  factory ActiveTripService() => _instance;
  ActiveTripService._();

  static const _period = Duration(seconds: 25);

  /// Para no repetir la consulta si varias partes la piden a la vez.
  static const _minGap = Duration(seconds: 4);

  /// Viaje activo del usuario, o null si no tiene.
  final ValueNotifier<Trip?> active = ValueNotifier(null);

  /// Cuántas pantallas del viaje están abiertas (normalmente 0 o 1). Mientras
  /// haya una, la franja se oculta (ya está en el viaje o en un paso de él).
  final ValueNotifier<int> tripScreens = ValueNotifier(0);

  GoRouter? _router;
  Session? _session;
  TripsRepository? _trips;
  Timer? _timer;
  bool _foreground = true;
  bool _loading = false;
  DateTime? _lastAt;
  bool _attached = false;

  /// Sube con [clear]: una consulta que salió antes ya no sirve.
  int _gen = 0;

  /// Se pidió una consulta forzada mientras otra corría: se repite al final.
  bool _again = false;

  /// Pasajero: viaje cuyo grupo del hub se sigue (avisa al instante si se
  /// cancela, se asigna o termina).
  String? _hubTripId;
  bool _hubListening = false;

  bool get hasActive => active.value != null;

  void attach({
    required GoRouter router,
    required Session session,
    required TripsRepository trips,
  }) {
    _router = router;
    _trips = trips;
    _session?.removeListener(_onSession);
    _session = session;
    session.addListener(_onSession);
    if (!_attached) {
      _attached = true;
      WidgetsBinding.instance.addObserver(this);
    }
    _onSession();
  }

  bool get _isDriver => _session?.role == UserRole.driver;
  bool get _isPassenger => _session?.role == UserRole.passenger;
  bool get _tracks => _isDriver || _isPassenger;

  void _onSession() {
    if (_tracks) {
      // Recién entró (conductor o pasajero): consulta ya.
      if (_timer == null) {
        _timer = Timer.periodic(_period, (_) => refresh());
        refresh(force: true);
      }
      _listenHub(_isPassenger);
    } else {
      _gen++;
      _timer?.cancel();
      _timer = null;
      active.value = null;
      _listenHub(false);
      // El hub ya olvidó las suscripciones al cerrar sesión.
      _hubTripId = null;
    }
  }

  /// Pasajero: el hub (su viaje y sus avisos) dispara una nueva consulta.
  void _listenHub(bool on) {
    if (on == _hubListening) return;
    _hubListening = on;
    final hub = TripsHubService();
    if (on) {
      hub.tripChanged.addListener(_onHubEvent);
      hub.userNotification.addListener(_onHubEvent);
    } else {
      hub.tripChanged.removeListener(_onHubEvent);
      hub.userNotification.removeListener(_onHubEvent);
    }
  }

  void _onHubEvent() {
    if (_isPassenger) refresh(force: true);
  }

  /// Pasajero: entra al grupo del hub de su viaje activo (y sale del
  /// anterior) para enterarse al instante de cambios.
  void _syncHubTrip(String? tripId) {
    if (tripId == _hubTripId) return;
    final hub = TripsHubService();
    final prev = _hubTripId;
    _hubTripId = tripId;
    if (prev != null) hub.leaveTrip(prev);
    if (tripId != null) hub.joinTrip(tripId);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final was = _foreground;
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground && !was) refresh(force: true);
  }

  /// Vuelve a consultar el viaje activo. Sin red se mantiene el último dato.
  Future<void> refresh({bool force = false}) async {
    final repo = _trips;
    if (repo == null || !_tracks || !_foreground) return;
    if (_loading) {
      if (force) _again = true;
      return;
    }
    final last = _lastAt;
    if (!force && last != null && DateTime.now().difference(last) < _minGap) {
      return;
    }
    _loading = true;
    _lastAt = DateTime.now();
    final gen = _gen;
    try {
      final t = await repo.getActive();
      if (!_tracks || gen != _gen) return;
      final bool isActive;
      if (_isDriver) {
        // Misma regla que usaba Solicitudes para saltar al viaje en curso.
        isActive = t != null &&
            t.driverId != null &&
            (t.status == TripStatus.accepted ||
                t.status == TripStatus.inProgress ||
                t.status == TripStatus.sosActive);
      } else {
        // Pasajero: cualquier viaje que siga vigente (también buscando o
        // negociando, y los creados desde la web).
        isActive = t != null &&
            t.status != TripStatus.completed &&
            t.status != TripStatus.cancelled;
      }
      final next = isActive ? t : null;
      if (_isPassenger) _syncHubTrip(next?.id);
      final prev = active.value;
      // Solo avisa si cambió algo visible (otro viaje o otro estado).
      if (prev?.id != next?.id || prev?.status != next?.status) {
        active.value = next;
      }
    } catch (_) {
      // Sin red: dejamos el último valor.
    } finally {
      _loading = false;
      if (_again) {
        _again = false;
        refresh(force: true);
      }
    }
  }

  /// El viaje terminó o se canceló desde la propia pantalla del viaje: se
  /// quita ya (sin esperar a la próxima consulta) para que la franja no
  /// aparezca un instante al salir.
  void clear() {
    _gen++;
    active.value = null;
  }

  /// Abre la pantalla del viaje (ruta existente): el viaje en curso del
  /// conductor o el seguimiento del pasajero.
  void openTrip() {
    if (_isPassenger) {
      final id = active.value?.id;
      _router?.push(
          id == null ? '/passenger/tracking' : '/passenger/tracking?trip=$id');
      return;
    }
    _router?.push('/driver/trip-in-progress');
  }
}
