import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../modules/trips/data/trips_repository.dart';
import '../../modules/trips/domain/trip_model.dart';
import '../session/session.dart';

/// Viaje activo del conductor (aceptado / en curso / SOS).
///
/// Usa la consulta existente GET /trips/active. Se refresca:
///  - al iniciar sesión como conductor,
///  - al volver la app a primer plano,
///  - cada [_period] mientras la app está abierta,
///  - cuando llega un push (FcmService llama a [refresh]),
///  - cuando alguna pantalla lo pide (Solicitudes en su consulta, la
///    pantalla del viaje al cerrarse).
///
/// Lo escuchan la franja "Viaje en curso · Volver" (ActiveTripFrame) y la
/// pantalla de Solicitudes (bloquea aceptar/proponer mientras haya viaje).
class ActiveTripService with WidgetsBindingObserver {
  static final ActiveTripService _instance = ActiveTripService._();
  factory ActiveTripService() => _instance;
  ActiveTripService._();

  static const _period = Duration(seconds: 25);

  /// Para no repetir la consulta si varias partes la piden a la vez.
  static const _minGap = Duration(seconds: 4);

  /// Viaje activo del conductor, o null si no tiene.
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

  void _onSession() {
    if (_isDriver) {
      // Recién entró como conductor: consulta ya.
      if (_timer == null) {
        _timer = Timer.periodic(_period, (_) => refresh());
        refresh(force: true);
      }
    } else {
      _gen++;
      _timer?.cancel();
      _timer = null;
      active.value = null;
    }
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
    if (repo == null || !_isDriver || !_foreground || _loading) return;
    final last = _lastAt;
    if (!force && last != null && DateTime.now().difference(last) < _minGap) {
      return;
    }
    _loading = true;
    _lastAt = DateTime.now();
    final gen = _gen;
    try {
      final t = await repo.getActive();
      if (!_isDriver || gen != _gen) return;
      // Misma regla que usaba Solicitudes para saltar al viaje en curso.
      final isActive = t != null &&
          t.driverId != null &&
          (t.status == TripStatus.accepted ||
              t.status == TripStatus.inProgress ||
              t.status == TripStatus.sosActive);
      final next = isActive ? t : null;
      final prev = active.value;
      // Solo avisa si cambió algo visible (otro viaje o otro estado).
      if (prev?.id != next?.id || prev?.status != next?.status) {
        active.value = next;
      }
    } catch (_) {
      // Sin red: dejamos el último valor.
    } finally {
      _loading = false;
    }
  }

  /// El viaje terminó o se canceló desde la propia pantalla del viaje: se
  /// quita ya (sin esperar a la próxima consulta) para que la franja no
  /// aparezca un instante al salir.
  void clear() {
    _gen++;
    active.value = null;
  }

  /// Abre la pantalla del viaje (ruta existente).
  void openTrip() {
    _router?.push('/driver/trip-in-progress');
  }
}
