import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:signalr_netcore/signalr_client.dart';

import '../api/api_config.dart';
import '../session/session.dart';

/// Cambio de estado de un viaje (evento `TripChanged` del hub).
class TripChangedEvent {
  final String tripId;
  final int? status;
  final String? reason;
  final DateTime at;
  TripChangedEvent(this.tripId, this.status, this.reason) : at = DateTime.now();
}

/// Cambio en las ofertas de un viaje (evento `ProposalsChanged`).
class ProposalsChangedEvent {
  final String tripId;
  final String? proposalId;
  final String? driverId;
  final String? status;
  final String? reason;
  final DateTime at;
  ProposalsChangedEvent(
      this.tripId, this.proposalId, this.driverId, this.status, this.reason)
      : at = DateTime.now();
}

/// Posición del conductor del viaje (evento `DriverLocation`, solo tras
/// JoinTrip). heading y speedKmh pueden venir null.
class DriverLocationEvent {
  final String tripId;
  final double lat;
  final double lng;
  final double? heading;
  final double? speedKmh;
  final DateTime at;
  DriverLocationEvent(this.tripId, this.lat, this.lng, this.heading,
      this.speedKmh, DateTime? at)
      : at = at ?? DateTime.now();
}

/// Cambio en las solicitudes pendientes para conductores (evento
/// `RequestsChanged`, solo tras JoinDriverRequests).
class RequestsChangedEvent {
  final String tripId;
  final String? reason;
  final DateTime at;
  RequestsChangedEvent(this.tripId, this.reason) : at = DateTime.now();
}

/// Espejo por el hub de un push FCM al usuario (evento `UserNotification`).
/// En la app NO se muestra como aviso (FCM ya lo hace): solo sirve como
/// disparador de recarga si llega antes que el push.
class UserNotificationEvent {
  final String? type;
  final String title;
  final String body;
  final Map<String, String> data;
  final DateTime at;
  UserNotificationEvent(this.type, this.title, this.body, this.data)
      : at = DateTime.now();

  String? get tripId {
    final id = data['trip_id'] ?? data['tripId'];
    return (id == null || id.isEmpty) ? null : id;
  }

  String? get notificationId {
    final id = data['notification_id'];
    return (id == null || id.isEmpty) ? null : id;
  }
}

/// Canal en tiempo real con Trips API (hub SignalR `/hubs/trips`).
///
/// UNA conexión por app; las pantallas se suscriben con [joinTrip] /
/// [joinDriverRequests] (con conteo de referencias) y escuchan los
/// ValueNotifier de cada evento. La conexión se abre cuando hay al menos una
/// suscripción y el usuario (pasajero o conductor) está logueado; se cierra
/// al quedarse sin suscripciones, al pasar a segundo plano y al cerrar
/// sesión. Al volver a primer plano o al reconectar se vuelve a entrar a los
/// grupos y [connected] pasa a true: las pantallas hacen UNA recarga completa.
///
/// Si el hub falla (sin red, join rechazado) no se avisa al usuario: las
/// pantallas siguen con su polling de respaldo (log solo en debug).
class TripsHubService with WidgetsBindingObserver {
  static final TripsHubService _instance = TripsHubService._();
  factory TripsHubService() => _instance;
  TripsHubService._();

  /// true mientras la conexión está abierta y ya se volvió a entrar a los
  /// grupos. Las pantallas lo usan para alargar su polling (30 s) y para
  /// recargar al (re)conectar.
  final ValueNotifier<bool> connected = ValueNotifier(false);

  final ValueNotifier<TripChangedEvent?> tripChanged = ValueNotifier(null);
  final ValueNotifier<ProposalsChangedEvent?> proposalsChanged =
      ValueNotifier(null);
  final ValueNotifier<DriverLocationEvent?> driverLocation =
      ValueNotifier(null);
  final ValueNotifier<RequestsChangedEvent?> requestsChanged =
      ValueNotifier(null);
  final ValueNotifier<UserNotificationEvent?> userNotification =
      ValueNotifier(null);

  /// Reintentos de la reconexión automática de SignalR (ms).
  static const _retryDelaysMs = [0, 2000, 5000, 10000, 30000];

  /// Si la conexión se cierra sin poder reconectar (o no se pudo abrir), se
  /// vuelve a intentar a los 10 s y luego cada 30 s.
  static const _retryFirst = Duration(seconds: 10);
  static const _retryNext = Duration(seconds: 30);

  /// Al quedarse sin suscripciones se espera un poco antes de cerrar, por si
  /// la siguiente pantalla se suscribe enseguida (evita abrir y cerrar).
  static const _idleClose = Duration(seconds: 3);

  /// Debounce por evento + viaje: el mismo evento puede llegar dos veces
  /// (grupo del viaje + grupo del usuario).
  static const _tripDebounce = Duration(milliseconds: 250);
  static const _requestsDebounce = Duration(milliseconds: 400);

  Session? _session;
  HubConnection? _hub;
  bool _attached = false;
  bool _foreground = true;
  bool _starting = false;
  int _retries = 0;
  Timer? _retryTimer;
  Timer? _idleTimer;

  /// Viajes suscritos → cuántas pantallas los piden.
  final Map<String, int> _tripRefs = {};
  /// Viajes a los que el servidor ya nos dejó entrar en esta conexión.
  final Set<String> _tripJoined = {};
  int _requestsRefs = 0;
  bool _requestsJoined = false;

  final Map<String, Timer> _debounce = {};

  /// Últimos notification_id vistos (por FCM o por el hub) para no disparar
  /// dos recargas por el mismo aviso. El literal conserva el orden de
  /// inserción, así se descarta el más antiguo.
  final _seenNotifications = <String>{};
  static const _seenMax = 50;

  // ── Ciclo de vida ────────────────────────────────────────────────────────

  /// Llamar una vez al arrancar la app (main.dart). Escucha la sesión para
  /// desconectar al cerrar sesión y los cambios de primer/segundo plano.
  void attach({required Session session}) {
    _session?.removeListener(_onSession);
    _session = session;
    session.addListener(_onSession);
    if (!_attached) {
      _attached = true;
      WidgetsBinding.instance.addObserver(this);
    }
  }

  bool get _canConnect {
    final s = _session;
    return s != null &&
        s.isLoggedIn &&
        (s.role == UserRole.passenger || s.role == UserRole.driver);
  }

  bool get _hasSubscriptions => _tripRefs.isNotEmpty || _requestsRefs > 0;

  void _onSession() {
    if (!_canConnect) {
      // Cerró sesión (o la cerró el backend): se corta la conexión y se
      // olvidan las suscripciones para no entrar a grupos de otro usuario.
      _tripRefs.clear();
      _requestsRefs = 0;
      _stop();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        _foreground = true;
        _ensureConnected();
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
      case AppLifecycleState.detached:
        // Segundo plano: FCM se encarga; el socket se cierra para no gastar
        // batería ni datos. Al volver se reconecta y se reingresa a los grupos.
        _foreground = false;
        _stop();
        break;
      case AppLifecycleState.inactive:
        // Transitorio (diálogo del sistema, barra de notificaciones): se deja.
        break;
    }
  }

  // ── Suscripciones ────────────────────────────────────────────────────────

  /// Entra al grupo del viaje. Varias pantallas pueden pedir el mismo viaje;
  /// se sale recién cuando todas llaman a [leaveTrip]. Si el servidor
  /// rechaza el join (sin acceso) no rompe: la pantalla sigue con polling y
  /// se vuelve a intentar al reconectar o al llamar de nuevo a [joinTrip].
  Future<void> joinTrip(String tripId) async {
    if (tripId.isEmpty) return;
    _idleTimer?.cancel();
    _tripRefs[tripId] = (_tripRefs[tripId] ?? 0) + 1;
    if (_isConnected) {
      await _invokeJoinTrip(tripId);
    } else {
      _ensureConnected();
    }
  }

  Future<void> leaveTrip(String tripId) async {
    final refs = _tripRefs[tripId];
    if (refs == null) return;
    if (refs > 1) {
      _tripRefs[tripId] = refs - 1;
      return;
    }
    _tripRefs.remove(tripId);
    if (_isConnected && _tripJoined.remove(tripId)) {
      await _safeInvoke('LeaveTrip', [tripId]);
    }
    _closeIfIdle();
  }

  /// Vuelve a intentar el join de un viaje ya pedido con [joinTrip] cuyo
  /// acceso pudo cambiar (p. ej. el conductor acaba de ofertar). No suma
  /// referencias y no hace nada si ya está dentro.
  Future<void> retryJoinTrip(String tripId) async {
    if (!_tripRefs.containsKey(tripId) || !_isConnected) return;
    await _invokeJoinTrip(tripId);
  }

  /// Conductor aprobado: entra al grupo de solicitudes (RequestsChanged).
  Future<void> joinDriverRequests() async {
    _idleTimer?.cancel();
    _requestsRefs++;
    if (_isConnected) {
      await _invokeJoinRequests();
    } else {
      _ensureConnected();
    }
  }

  Future<void> leaveDriverRequests() async {
    if (_requestsRefs == 0) return;
    _requestsRefs--;
    if (_requestsRefs > 0) return;
    if (_isConnected && _requestsJoined) {
      _requestsJoined = false;
      await _safeInvoke('LeaveDriverRequests', const []);
    }
    _closeIfIdle();
  }

  /// FCM ya atendió este aviso: si llega también por el hub, se ignora.
  void markNotificationSeen(String? notificationId) {
    if (notificationId == null || notificationId.isEmpty) return;
    _seenNotifications.add(notificationId);
    while (_seenNotifications.length > _seenMax) {
      _seenNotifications.remove(_seenNotifications.first);
    }
  }

  // ── Conexión ─────────────────────────────────────────────────────────────

  bool get _isConnected =>
      _hub != null && _hub!.state == HubConnectionState.Connected;

  String get _hubUrl {
    final raw = ApiConfig.trips;
    final base = raw.endsWith('/api') ? raw.substring(0, raw.length - 4) : raw;
    return '$base/hubs/trips';
  }

  HubConnection _build() {
    final hub = HubConnectionBuilder()
        .withUrl(
          _hubUrl,
          options: HttpConnectionOptions(
            // Se lee en cada (re)conexión: si el token cambió (p. ej. tras
            // cambiar la contraseña) se usa el nuevo.
            accessTokenFactory: () async =>
                (await _session?.getToken()) ?? '',
          ),
        )
        .withAutomaticReconnect(retryDelays: _retryDelaysMs)
        .build();

    hub.on('TripChanged', _onTripChanged);
    hub.on('ProposalsChanged', _onProposalsChanged);
    hub.on('DriverLocation', _onDriverLocation);
    hub.on('RequestsChanged', _onRequestsChanged);
    hub.on('UserNotification', _onUserNotification);

    hub.onreconnecting(({error}) {
      _log('reconectando… ${error ?? ''}');
      _setConnected(false);
    });
    hub.onreconnected(({connectionId}) {
      _log('reconectado');
      _retries = 0;
      _rejoinAll();
    });
    hub.onclose(({error}) {
      _log('cerrado ${error ?? ''}');
      _setConnected(false);
      _tripJoined.clear();
      _requestsJoined = false;
      if (_shouldBeConnected) _scheduleRetry();
    });
    return hub;
  }

  bool get _shouldBeConnected =>
      _canConnect && _foreground && _hasSubscriptions;

  Future<void> _ensureConnected() async {
    if (!_shouldBeConnected || _starting) return;
    final hub = _hub ??= _build();
    if (hub.state != HubConnectionState.Disconnected) return;
    _retryTimer?.cancel();
    _starting = true;
    try {
      await hub.start();
      _retries = 0;
      _log('conectado');
      await _rejoinAll();
    } catch (e) {
      _log('no se pudo conectar: $e');
      _setConnected(false);
      if (_shouldBeConnected) _scheduleRetry();
    } finally {
      _starting = false;
    }
    // Mientras conectaba pudo cerrarse sesión o irse a segundo plano.
    if (!_shouldBeConnected) _stop();
  }

  void _scheduleRetry() {
    _retryTimer?.cancel();
    final delay = _retries == 0 ? _retryFirst : _retryNext;
    _retries++;
    _retryTimer = Timer(delay, _ensureConnected);
  }

  Future<void> _rejoinAll() async {
    _tripJoined.clear();
    _requestsJoined = false;
    for (final tripId in _tripRefs.keys.toList()) {
      await _invokeJoinTrip(tripId);
    }
    if (_requestsRefs > 0) await _invokeJoinRequests();
    // Recién ahora las pantallas recargan: ya están en sus grupos.
    _setConnected(_isConnected);
  }

  Future<void> _invokeJoinTrip(String tripId) async {
    if (_tripJoined.contains(tripId)) return;
    if (await _safeInvoke('JoinTrip', [tripId])) _tripJoined.add(tripId);
  }

  Future<void> _invokeJoinRequests() async {
    if (_requestsJoined) return;
    _requestsJoined = await _safeInvoke('JoinDriverRequests', const []);
  }

  /// invoke sin lanzar: un HubException ("No tienes acceso a este viaje.",
  /// estado del conductor) o la conexión caída solo se loguean en debug.
  Future<bool> _safeInvoke(String method, List<Object> args) async {
    final hub = _hub;
    if (hub == null || hub.state != HubConnectionState.Connected) return false;
    try {
      await hub.invoke(method, args: args);
      return true;
    } catch (e) {
      _log('$method falló: $e');
      return false;
    }
  }

  void _closeIfIdle() {
    if (_hasSubscriptions) return;
    _idleTimer?.cancel();
    _idleTimer = Timer(_idleClose, () {
      if (!_hasSubscriptions) _stop();
    });
  }

  Future<void> _stop() async {
    _retryTimer?.cancel();
    _idleTimer?.cancel();
    _retries = 0;
    for (final t in _debounce.values) {
      t.cancel();
    }
    _debounce.clear();
    _tripJoined.clear();
    _requestsJoined = false;
    _setConnected(false);
    final hub = _hub;
    if (hub == null) return;
    try {
      await hub.stop();
    } catch (e) {
      _log('stop falló: $e');
    }
  }

  void _setConnected(bool value) {
    if (connected.value != value) connected.value = value;
  }

  // ── Eventos ──────────────────────────────────────────────────────────────

  Map<String, dynamic>? _payload(List<Object?>? args) {
    if (args == null || args.isEmpty) return null;
    final p = args.first;
    if (p is Map) return p.map((k, v) => MapEntry(k.toString(), v));
    return null;
  }

  static String? _str(dynamic v) {
    if (v == null) return null;
    final s = v.toString();
    return s.isEmpty ? null : s;
  }

  static double? _dbl(dynamic v) => v is num ? v.toDouble() : null;

  static int? _int(dynamic v) => v is num ? v.toInt() : null;

  void _debounced(String key, Duration wait, VoidCallback fire) {
    _debounce[key]?.cancel();
    _debounce[key] = Timer(wait, () {
      _debounce.remove(key);
      fire();
    });
  }

  void _onTripChanged(List<Object?>? args) {
    final p = _payload(args);
    final tripId = _str(p?['tripId']);
    if (p == null || tripId == null) return;
    _debounced('trip:$tripId', _tripDebounce, () {
      tripChanged.value =
          TripChangedEvent(tripId, _int(p['status']), _str(p['reason']));
    });
  }

  void _onProposalsChanged(List<Object?>? args) {
    final p = _payload(args);
    final tripId = _str(p?['tripId']);
    if (p == null || tripId == null) return;
    _debounced('proposals:$tripId', _tripDebounce, () {
      proposalsChanged.value = ProposalsChangedEvent(
        tripId,
        _str(p['proposalId']),
        _str(p['driverId']),
        _str(p['status']),
        _str(p['reason']),
      );
    });
  }

  void _onDriverLocation(List<Object?>? args) {
    final p = _payload(args);
    final tripId = _str(p?['tripId']);
    final lat = _dbl(p?['lat']);
    final lng = _dbl(p?['lng']);
    if (p == null || tripId == null || lat == null || lng == null) return;
    // Sin debounce: cada posición mueve el marcador.
    driverLocation.value = DriverLocationEvent(
      tripId,
      lat,
      lng,
      _dbl(p['heading']),
      _dbl(p['speedKmh']),
      DateTime.tryParse(_str(p['at']) ?? ''),
    );
  }

  void _onRequestsChanged(List<Object?>? args) {
    final p = _payload(args);
    final tripId = _str(p?['tripId']);
    if (p == null || tripId == null) return;
    _debounced('requests:$tripId', _requestsDebounce, () {
      requestsChanged.value = RequestsChangedEvent(tripId, _str(p['reason']));
    });
  }

  void _onUserNotification(List<Object?>? args) {
    final p = _payload(args);
    if (p == null) return;
    final raw = p['data'];
    final data = <String, String>{};
    if (raw is Map) {
      raw.forEach((k, v) {
        if (v != null) data[k.toString()] = v.toString();
      });
    }
    final e = UserNotificationEvent(
      _str(p['type']),
      _str(p['title']) ?? 'Bugie',
      _str(p['body']) ?? '',
      data,
    );
    // Ya llegó por FCM: no disparar otra recarga.
    final id = e.notificationId;
    if (id != null) {
      if (_seenNotifications.contains(id)) return;
      markNotificationSeen(id);
    }
    userNotification.value = e;
  }

  void _log(String msg) {
    if (kDebugMode) debugPrint('TripsHub: $msg');
  }
}
