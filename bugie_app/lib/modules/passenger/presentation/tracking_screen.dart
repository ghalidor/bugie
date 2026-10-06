import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:vibration/vibration.dart';

import '../../../core/api/api_config.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/admin_settings_service.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/services/trips_hub_service.dart';
import '../../../core/theme/bugie_theme.dart';
import 'apply_coupon_sheet.dart';
import '../../../core/ui/app_messenger.dart';
import '../../../core/utils/route_geometry.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../../core/widgets/delivery_info.dart';
import '../../../core/widgets/negotiation/negotiation.dart';
import '../../../core/widgets/service_badge.dart';
import '../../../core/widgets/schedule_picker.dart';
import '../../trips/data/trips_repository.dart';
import '../../rewards/data/rewards_repository.dart';
import '../../trips/domain/proposal_model.dart';
import '../../trips/domain/route_model.dart';
import '../../trips/domain/trip_model.dart';
import '../../favorites/data/favorites_repository.dart';

/// Seguimiento en tiempo real del viaje activo.
/// Polling cada 3s a /api/trips/active + /api/trips/{id}/proposals.
///
/// Reglas de la UI (alineadas con bugie-web/passenger/Tracking.tsx):
///   - Un solo card por conductor (el backend lo garantiza).
///   - Card normal (pending del conductor)        → botones aceptar / rechazar / contraproponer.
///   - Card naranja (pending del pasajero, mía)   → "esperando respuesta", solo histórico.
///   - Card rojo (rejected/driver, 24h)           → "el conductor declinó", con X para ocultar.
///   - Botón "Rechazar todas" sólo si hay 2+ propuestas pending del conductor.
class PassengerTrackingScreen extends StatefulWidget {
  /// Seguir un viaje en particular (ej. un programado que todavía no es el
  /// viaje activo). null = el viaje activo.
  final String? tripId;
  const PassengerTrackingScreen({super.key, this.tripId});

  @override
  State<PassengerTrackingScreen> createState() => _PassengerTrackingScreenState();
}

class _PassengerTrackingScreenState extends State<PassengerTrackingScreen>
    with WidgetsBindingObserver {
  Trip? _trip;
  /// Programados del pasajero (se muestran cuando no hay viaje activo).
  List<Trip> _scheduled = [];
  bool _republishing = false;
  List<Proposal> _proposals = [];
  RouteInfo? _routeInfo;
  bool _loading = true;
  String? _error;

  /// Controller del DraggableScrollableSheet. Lo usamos para mover el
  /// sheet manualmente desde el handle (animateTo), porque por defecto
  /// el handle no recibe gestos: solo el ListView interno los recibe.
  final DraggableScrollableController _sheetCtrl =
      DraggableScrollableController();

  /// IDs de conductores favoritos del pasajero. Se carga una vez al entrar
  /// y se usa para mostrar ⭐ al lado del nombre en cada propuesta.
  /// Set para lookup O(1).
  Set<String> _favoriteDriverIds = {};

  /// Timer del polling. Lo reagendamos en cada _load() con el intervalo
  /// que corresponda según el estado actual del viaje (adaptativo).
  Timer? _timer;

  /// True si la app está en foreground. Cuando va a background pausamos
  /// el polling para no gastar batería/datos/backend. Se reactiva al
  /// volver a foreground.
  bool _isForeground = true;

  /// Fallos consecutivos por error de red. Reinicia a 0 con cada éxito.
  /// Si llega a 2+ mostramos banner "sin conexión".
  int _failureCount = 0;

  /// Timestamp del último load exitoso. Lo mostramos en pantalla cuando
  /// hay problemas de red ("Última actualización hace 30s").
  DateTime? _lastSuccessAt;

  /// Timer que refresca el texto "hace X" sin pegarle al backend.
  Timer? _staleTickTimer;

  /// Viaje al que estamos suscritos en el hub (tiempo real). Cambia cuando
  /// cambia el viaje en pantalla (p. ej. al volver a pedir).
  String? _hubTripId;

  String? _lastRouteKey;

  /// IDs de cards que el usuario ocultó manualmente (X).
  /// Solo aplica a "el conductor declinó". No se persiste.
  final Set<String> _hiddenIds = {};

  /// True si hay problemas de red sostenidos (2+ fallos seguidos).
  bool get _isOffline => _failureCount >= 2;

  // ── Detección de desvío de ruta (solo inProgress) ─────────────────────

  /// Umbral en metros: si el conductor está más lejos que esto de la
  /// ruta más cercana, consideramos que está desviado.
  /// Lo configura el admin (deviation_threshold_m). Se lee UNA vez al entrar
  /// (no en cada actualización de GPS); si no se puede leer o no es un
  /// número válido, se usa [_defaultDeviationThresholdMeters].
  static const double _defaultDeviationThresholdMeters = 300;
  double _deviationThresholdMeters = _defaultDeviationThresholdMeters;

  /// Estado actual de desvío. Cuando true, mostramos banner y línea roja.
  bool _isDeviated = false;
  /// Bandera global: ¿está activa la detección de desvío?
  /// Se lee del admin (landing.SystemSettings → deviation_detection_enabled).
  /// Por defecto FALSE — solo se prende si el admin lo activa explícitamente.
  /// Esto evita molestar al pasajero con alertas que pueden ser falsos
  /// positivos cuando el conductor toma una ruta alternativa válida.
  bool _deviationFeatureEnabled = false;

  /// Distancia (m) del conductor a la ruta más cercana. Solo válida si _isDeviated.
  double _deviationDistance = 0;

  /// Punto más cercano de la ruta para dibujar la línea visual.
  LatLng? _deviationNearest;

  /// Timestamp de la última vibración para no vibrar más de 1 vez por minuto
  /// (la histéresis evita que vibre cada poll si sigue desviado).
  DateTime? _lastVibrationAt;

  /// True si ya mostramos el alert dialog (no lo mostramos otra vez en este
  /// episodio de desvío hasta que se reincorpore a la ruta).
  bool _alertShown = false;

  /// Reglas de monto para contraofertar (base_fare / fare_max_multiplier).
  FareRules _fareRules = const FareRules();

  /// Acción de negociación en curso (anti doble toque): id de la oferta
  /// (o [_actAll] para "Rechazar todas") y qué botón se pulsó
  /// ('accept' | 'choose' | 'reject' | 'counter' | 'undo' | 'reject-all').
  String? _actingId;
  String? _actingKind;
  static const _actAll = '*';

  /// Oferta que acepté y espera la confirmación del conductor (último
  /// sondeo), con su plazo: si desaparece después del plazo, el conductor
  /// no confirmó.
  Proposal? _lastAccepted;

  /// Viaje inmediato que Bugie canceló porque nadie lo aceptó a tiempo:
  /// se muestra "Nadie aceptó tu pedido…" con el botón para volver a pedir.
  Trip? _noDriverTrip;

  /// Viaje para el que ya mostramos "tu conductor llegó" (por sondeo).
  String? _arrivedShownTripId;
  /// Evita abrir dos avisos de llegada a la vez.
  bool _arrivedDialogOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Push "tu conductor llegó" (app abierta o al tocar la notificación).
    FcmService.driverArrived.addListener(_onDriverArrivedPush);
    // Push "viaje cancelado": refrescar ya (el aviso sale en _handleTripFinished).
    FcmService.tripCancelled.addListener(_onTripCancelledPush);
    // Cualquier otro push del viaje (oferta nueva/retirada, el conductor no
    // confirmó o tomó otro viaje, conductor asignado, viaje reabierto...).
    FcmService.tripEvent.addListener(_onTripPush);
    // Tiempo real (hub): cambios del viaje y de las ofertas → misma recarga
    // del polling; posición del conductor → mueve el marcador directo.
    final hub = TripsHubService();
    hub.connected.addListener(_onHubState);
    hub.tripChanged.addListener(_onHubTripChanged);
    hub.proposalsChanged.addListener(_onHubProposalsChanged);
    hub.driverLocation.addListener(_onHubDriverLocation);
    hub.userNotification.addListener(_onHubNotification);
    _load();
    _loadFareRules();
    _loadDeviationFlag();
    _loadFavoriteDrivers();
    // Cada 5s refrescamos el texto "hace X" del banner sin red.
    _staleTickTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) {
        if (mounted && _isOffline) setState(() {});
      },
    );
  }

  /// Carga la lista de IDs de conductores favoritos. Solo una vez al entrar
  /// (no la re-cargamos en cada polling porque cambian muy raramente).
  /// Si falla, no es crítico: simplemente no se marcan favoritos con corona.
  /// Vuelve a pedir el viaje. Se llama al aplicar o quitar un cupon, para
  /// que el precio en pantalla sea el que de verdad va a pagar.
  Future<void> _reloadTrip() async {
    if (!mounted) return;
    setState(() {});
  }

  Future<void> _loadFareRules() async {
    try {
      final r = await context.read<AdminSettingsService>().getFareRules();
      if (mounted) setState(() => _fareRules = r);
    } catch (_) {/* sin reglas: valida el backend */}
  }

  Future<void> _loadFavoriteDrivers() async {
    try {
      final ids = await context.read<FavoritesRepository>().getFavoriteDriverIds();
      if (mounted) setState(() => _favoriteDriverIds = ids);
    } catch (_) {
      // sin favoritos, no rompemos
    }
  }

  /// Lee del admin si la detección de desvío está activada y su umbral en
  /// metros. Se llama una sola vez al entrar a la pantalla.
  /// Si la red falla, se queda en los defaults (apagada, 300 m) — seguro.
  Future<void> _loadDeviationFlag() async {
    try {
      final settings = context.read<AdminSettingsService>();
      final enabled = await settings.getBool('deviation_detection_enabled',
          fallback: false);
      final threshold = await settings.getDouble('deviation_threshold_m',
          fallback: _defaultDeviationThresholdMeters);
      if (mounted) {
        setState(() {
          _deviationFeatureEnabled = enabled;
          _deviationThresholdMeters =
              threshold > 0 ? threshold : _defaultDeviationThresholdMeters;
        });
      }
    } catch (_) {/* los defaults ya cubren el caso */}
  }

  @override
  void dispose() {
    FcmService.driverArrived.removeListener(_onDriverArrivedPush);
    FcmService.tripCancelled.removeListener(_onTripCancelledPush);
    FcmService.tripEvent.removeListener(_onTripPush);
    final hub = TripsHubService();
    hub.connected.removeListener(_onHubState);
    hub.tripChanged.removeListener(_onHubTripChanged);
    hub.proposalsChanged.removeListener(_onHubProposalsChanged);
    hub.driverLocation.removeListener(_onHubDriverLocation);
    hub.userNotification.removeListener(_onHubNotification);
    _syncHubTrip(null);
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _staleTickTimer?.cancel();
    _sheetCtrl.dispose();
    // Si seguía corriendo el tracking del pasajero, lo paramos al salir
    // de la pantalla (ya no podemos sincronizarlo con el estado del viaje).
    // En la práctica el viaje se completa o cancela antes, pero por defensa:
    final tracking = context.read<LocationTrackingService>();
    if (tracking.isRunning &&
        (tracking.mode == TrackingMode.passengerWaiting ||
         tracking.mode == TrackingMode.passengerInTrip)) {
      tracking.stop();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final wasForeground = _isForeground;
    _isForeground = state == AppLifecycleState.resumed;

    if (_isForeground && !wasForeground) {
      // Volvió a foreground: recarga inmediato y reagenda polling.
      _load();
    } else if (!_isForeground) {
      // Se fue a background: cancelar timer para no consumir red.
      _timer?.cancel();
      _timer = null;
    }
  }

  /// Sincroniza el tracking del pasajero con el estado del viaje:
  ///   - Sin viaje / cancelado / completado → stop().
  ///   - Aceptado (esperando conductor)     → passengerWaiting (30s).
  ///   - En curso                            → passengerInTrip (10s).
  ///   - Pending / negotiating               → no manda ubicación
  ///     (el pasajero todavía no se ha movido del origen).
  /// El servicio aplica throttle de 20m + heartbeat 60s automáticamente.
  void _syncPassengerTracking(Trip? trip) {
    final tracking = context.read<LocationTrackingService>();
    final repo = context.read<TripsRepository>();

    // Modo objetivo según el estado del viaje.
    TrackingMode? target;
    if (trip != null) {
      switch (trip.status) {
        case TripStatus.accepted:
          target = TrackingMode.passengerWaiting;
          break;
        case TripStatus.inProgress:
        case TripStatus.sosActive:
          target = TrackingMode.passengerInTrip;
          break;
        default:
          target = null; // pending / negotiating / completed / cancelled
      }
    }

    if (target == null) {
      // Estado donde NO queremos mandar ubicación.
      if (tracking.isRunning &&
          (tracking.mode == TrackingMode.passengerWaiting ||
           tracking.mode == TrackingMode.passengerInTrip)) {
        tracking.stop();
      }
      return;
    }

    // Si ya está corriendo en el modo correcto, no hacemos nada.
    if (tracking.isRunning && tracking.mode == target) return;

    // Arrancar o cambiar de modo. start() también sirve para reemplazar
    // un tracking ya corriendo (sobreescribe sender y modo).
    tracking.start(
      mode: target,
      sender: (pos) => repo.updatePassengerLocation(
        lat: pos.latitude,
        lng: pos.longitude,
      ),
    );
  }

  /// Evalúa si el conductor está fuera de la ruta planeada por más
  /// de `_deviationThresholdMeters`. Solo aplica si:
  ///   - viaje está inProgress (pasajero ya está a bordo),
  ///   - tenemos la ruta calculada (_routeInfo),
  ///   - tenemos posición del conductor (trip.driverCurrentLat/Lng).
  ///
  /// Cuando detecta desvío:
  ///   - Setea _isDeviated = true → la UI muestra banner rojo + línea en mapa.
  ///   - Vibra el celular (máx. 1 vez por minuto para no molestar).
  ///   - La primera vez muestra un AlertDialog para que el pasajero revise.
  ///
  /// Cuando el conductor vuelve a la ruta, todo se desactiva.
  void _evaluateDeviation(Trip? trip) {
    // Si el admin tiene la feature DESACTIVADA, no evaluamos nada.
    // Esto incluye limpiar cualquier estado previo si la feature se desactiva
    // mientras el usuario está en la pantalla (con próximo poll lo verá).
    if (!_deviationFeatureEnabled) {
      if (_isDeviated) {
        setState(() {
          _isDeviated = false;
          _deviationNearest = null;
          _alertShown = false;
        });
      }
      return;
    }

    // Condiciones para que la detección esté activa
    final shouldEvaluate = trip != null &&
        trip.status == TripStatus.inProgress &&
        trip.driverCurrentLat != null &&
        trip.driverCurrentLng != null &&
        _routeInfo != null &&
        _routeInfo!.options.isNotEmpty &&
        _routeInfo!.options.first.coordinates.length >= 2;

    if (!shouldEvaluate) {
      // Limpia el estado si no aplica (ej. el viaje pasó a completed).
      if (_isDeviated) {
        setState(() {
          _isDeviated = false;
          _deviationNearest = null;
          _alertShown = false;
        });
      }
      return;
    }

    final driverPos = LatLng(trip.driverCurrentLat!, trip.driverCurrentLng!);
    final route = _routeInfo!.options.first.coordinates;
    final result = RouteGeometry.nearestOnPolyline(driverPos, route);

    final nowDeviated = result.distanceMeters > _deviationThresholdMeters;

    if (nowDeviated) {
      // Actualizar visual cada vez que tengamos una nueva medición
      setState(() {
        _isDeviated = true;
        _deviationDistance = result.distanceMeters;
        _deviationNearest = result.nearestOnRoute;
      });

      // Vibrar máximo 1 vez por minuto para no molestar
      final now = DateTime.now();
      final canVibrate = _lastVibrationAt == null ||
          now.difference(_lastVibrationAt!).inSeconds >= 60;
      if (canVibrate) {
        _lastVibrationAt = now;
        _vibrateAlert();
      }

      // Mostrar el alert solo la primera vez de este episodio de desvío
      if (!_alertShown && mounted) {
        _alertShown = true;
        _showDeviationAlert(result.distanceMeters);
      }
    } else {
      // Conductor volvió a la ruta: limpiar todo el estado de desvío
      if (_isDeviated) {
        setState(() {
          _isDeviated = false;
          _deviationNearest = null;
          _alertShown = false;
        });
      }
    }
  }

  /// Vibración de alerta. Patrón: 500ms vibra, 200ms pausa, 500ms vibra.
  /// Si el paquete vibration no está disponible (caso muy raro en celulares
  /// modernos), imprime en consola para que se pueda diagnosticar.
  Future<void> _vibrateAlert() async {
    try {
      final has = await Vibration.hasVibrator();
      if (!has) {
        debugPrint('[Bugie] Vibration.hasVibrator devolvió false. '
            'El dispositivo no tiene vibrador o falta el permiso VIBRATE '
            'en AndroidManifest.xml.');
        return;
      }
      debugPrint('[Bugie] Vibrando alerta de desvío...');
      Vibration.vibrate(pattern: [0, 500, 200, 500]);
    } catch (e) {
      debugPrint('[Bugie] Error al intentar vibrar: $e');
    }
  }

  void _onTripCancelledPush() {
    if (mounted) _load();
  }

  /// Push de un viaje: recargar si es el que estoy viendo (o si no tengo
  /// ninguno en pantalla). trip_cancelled ya lo atiende _onTripCancelledPush.
  void _onTripPush() {
    final e = FcmService.tripEvent.value;
    if (!mounted || e == null || e.type == 'trip_cancelled') return;
    final shown = _trip?.id ?? widget.tripId;
    if (shown == null || shown == e.tripId) _load();
  }

  // ── Tiempo real (hub de Trips) ──────────────────────────────────────────

  /// Suscribe al viaje en pantalla (y deja el anterior si cambió).
  void _syncHubTrip(String? tripId) {
    if (tripId == _hubTripId) return;
    final hub = TripsHubService();
    final prev = _hubTripId;
    if (prev != null) hub.leaveTrip(prev);
    _hubTripId = tripId;
    if (tripId != null) hub.joinTrip(tripId);
  }

  /// Hub (re)conectado: recarga completa (ya estamos en el grupo del viaje).
  /// Hub caído: vuelve al polling corto.
  void _onHubState() {
    if (!mounted) return;
    if (TripsHubService().connected.value) {
      _load();
    } else {
      _scheduleNext();
    }
  }

  /// true si el evento es del viaje que se muestra (o no hay ninguno aún).
  bool _isShownTrip(String tripId) {
    final shown = _trip?.id ?? widget.tripId;
    return shown == null || shown == tripId;
  }

  void _onHubTripChanged() {
    final e = TripsHubService().tripChanged.value;
    if (!mounted || e == null || !_isShownTrip(e.tripId)) return;
    _load();
  }

  void _onHubProposalsChanged() {
    final e = TripsHubService().proposalsChanged.value;
    if (!mounted || e == null || !_isShownTrip(e.tripId)) return;
    _load();
  }

  /// Posición del conductor: se mueve el marcador sin volver a pedir el
  /// viaje (y se reevalúa el desvío con la posición nueva).
  void _onHubDriverLocation() {
    final e = TripsHubService().driverLocation.value;
    final t = _trip;
    if (!mounted || e == null || t == null || e.tripId != t.id) return;
    setState(() {
      _trip = t.withDriverLocation(lat: e.lat, lng: e.lng, at: e.at);
    });
    _evaluateDeviation(_trip);
  }

  /// Espejo de un push por el hub: no se muestra (FCM ya lo hace); solo
  /// recarga si es del viaje abierto.
  void _onHubNotification() {
    final e = TripsHubService().userNotification.value;
    if (!mounted || e == null) return;
    final shown = _trip?.id ?? widget.tripId;
    if (e.tripId != null && e.tripId == shown) _load();
  }

  /// Llegó el push "tu conductor llegó": refresca el viaje y muestra el aviso.
  /// Si el conductor vuelve a avisar, se muestra de nuevo.
  void _onDriverArrivedPush() {
    if (!mounted || FcmService.driverArrived.value == null) return;
    _load();
    _showDriverArrivedDialog();
  }

  /// Aviso: el conductor (o Bugie) canceló el viaje, con el motivo.
  Future<void> _showCancelledDialog(Trip t) async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.cancel_outlined, size: 48, color: BugieColors.danger),
        title: Text(t.cancelledBy == 'driver'
            ? 'Tu conductor canceló el ${t.isDelivery ? 'envío' : 'viaje'}'
            : 'Bugie canceló tu ${t.isDelivery ? 'envío' : 'viaje'}'),
        content: Text(
          '${t.cancelReason != null ? 'Motivo: ${t.cancelReason}\n\n' : ''}'
          'Puedes solicitar otro ${t.isDelivery ? 'envío' : 'viaje'} cuando quieras.',
          textAlign: TextAlign.center,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cerrar'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.go('/passenger');
            },
            child: const Text('Solicitar otro'),
          ),
        ],
      ),
    );
  }

  /// Aviso emergente: el conductor ya está en el punto de recojo.
  Future<void> _showDriverArrivedDialog() async {
    if (!mounted || _arrivedDialogOpen) return;
    _arrivedDialogOpen = true;
    try {
      if (await Vibration.hasVibrator()) Vibration.vibrate(duration: 600);
    } catch (_) {}
    if (!mounted) { _arrivedDialogOpen = false; return; }
    final t = _trip;
    final detalle = [
      if (t?.driverName != null) t!.driverName!,
      if (t?.vehiclePlate != null) 'Placa ${t!.vehiclePlate}',
    ].join(' · ');
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.place, size: 48, color: BugieColors.success),
        title: const Text('Tu conductor llegó'),
        content: Text(
          'Tu conductor ya está en el punto de recojo. Sal a su encuentro.'
          '${detalle.isEmpty ? '' : '\n\n$detalle'}',
          textAlign: TextAlign.center,
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
    _arrivedDialogOpen = false;
  }

  /// Muestra el alert dialog cuando se detecta el primer desvío del episodio.
  void _showDeviationAlert(double meters) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded,
            size: 48, color: BugieColors.danger),
        title: const Text('Tu conductor se está desviando'),
        content: Text(
          'Se ha alejado ${meters.round()} m de la ruta planificada. '
          'Revisa el mapa y mantente atento.',
          textAlign: TextAlign.center,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  /// Intervalo del próximo polling.
  /// Si hubo fallos consecutivos por red, aplica backoff exponencial:
  /// 5s → 10s → 20s → 30s (techo). Cada éxito resetea el contador.
  /// Si no hay fallos, intervalo según actividad del viaje.
  Duration _pollingInterval() {
    if (_failureCount > 0) {
      // 2^n * 5s, máximo 30s. Da reintentos rápidos sin saturar la red.
      final seconds =
          (5 * (1 << (_failureCount - 1))).clamp(5, 30);
      return Duration(seconds: seconds);
    }
    // Con el hub conectado los cambios llegan al instante: el polling queda
    // solo de respaldo.
    if (TripsHubService().connected.value) return const Duration(seconds: 30);
    final t = _trip;
    if (t == null) {
      // No hay viaje activo. Solo verificamos cada 30s por si el usuario
      // crea uno desde otro dispositivo.
      return const Duration(seconds: 30);
    }
    // Hay negociación activa (propuestas pendientes o contrapropuestas)
    // → necesitamos refrescar rápido para reaccionar a cambios.
    final hasActiveNegotiation = _proposals.any((p) => p.status == 'pending');
    if (hasActiveNegotiation ||
        t.status == TripStatus.pending ||
        t.status == TripStatus.negotiating) {
      return const Duration(seconds: 3);
    }
    // Viaje aceptado / en curso → seguir tracking pero más relajado.
    return const Duration(seconds: 10);
  }

  /// Reagenda el siguiente _load() con el intervalo actual.
  void _scheduleNext() {
    _timer?.cancel();
    if (!_isForeground) return; // Pausado: no reagenda.
    _timer = Timer(_pollingInterval(), _load);
  }

  /// Id del viaje cuya finalización ya procesamos (para no mostrar el popup
  /// de calificación más de una vez).
  String? _completionHandledTripId;

  /// El viaje pasó a un estado final. Confirmamos vía historial si se COMPLETÓ
  /// (no cancelado) y, si el pasajero no lo calificó aún, mostramos el popup.
  Future<void> _handleTripFinished(Trip prev) async {
    final repo = context.read<TripsRepository>();
    Trip? fin;
    try {
      fin = await repo.getById(prev.id);
    } catch (_) {}

    // Nadie aceptó el pedido a tiempo (Bugie lo canceló).
    if (fin != null && _isNoDriverCancel(fin)) {
      if (mounted) setState(() => _noDriverTrip = fin);
      return;
    }

    // Cancelado por el conductor (o por Bugie): avisar con el motivo.
    if (fin != null &&
        fin.status == TripStatus.cancelled &&
        fin.cancelledBy != null &&
        fin.cancelledBy != 'passenger') {
      if (!mounted) return;
      await _showCancelledDialog(fin);
      return;
    }

    final completed = fin?.status == TripStatus.completed;
    if (!completed) return; // cancelado por el pasajero u otro: no calificamos

    // ¿ya lo calificó antes? entonces solo volvemos al dashboard.
    try {
      final existing = await repo.getTripRating(prev.id);
      if (existing != null) {
        if (mounted) {
          context.go('/passenger');
          showSuccessSnack(prev.isDelivery ? '¡Envío completado!' : '¡Viaje completado!');
        }
        return;
      }
    } catch (_) {}

    if (!mounted) return;
    await showDialog(
      context: context,
      barrierDismissible: false, // no se cierra tocando afuera
      builder: (_) => _TripCompletedDialog(trip: prev),
    );
  }

  /// Viaje inmediato cancelado por Bugie (cancelledBy 'system'): nadie lo
  /// aceptó en trip_no_driver_cancel_min (no_driver_timeout).
  static bool _isNoDriverCancel(Trip t) =>
      t.status == TripStatus.cancelled &&
      t.cancelledBy == 'system' &&
      !t.isScheduled;

  /// Viaje que terminó al buscarlo por id (lo deja _loadById).
  Trip? _finishedById;

  Future<void> _load() async {
    // Si la app está en background, no hacemos request.
    if (!_isForeground) return;

    final repo = context.read<TripsRepository>();
    try {
      final trip = widget.tripId != null
          ? await _loadById(repo, widget.tripId!)
          : await repo.getActive();

      // Sin viaje: traer sus programados para mostrarlos.
      List<Trip> scheduled = const [];
      if (trip == null) {
        try {
          scheduled = await repo.getScheduled();
        } catch (_) {}
      }

      List<Proposal> proposals = [];
      if (trip != null &&
          (trip.status == TripStatus.pending ||
              trip.status == TripStatus.negotiating)) {
        try {
          proposals = await repo.getProposals(trip.id);
        } catch (_) {}
      }

      if (!mounted) return;
      final prevTrip = _trip;

      // La oferta que acepté desapareció después de su plazo: el conductor
      // no confirmó (si el viaje sigue buscando conductor).
      final accepted = proposals
          .where((p) => p.isWaitingDriverConfirmation)
          .firstOrNull;
      final lost = _lastAccepted;
      if (lost != null &&
          trip != null &&
          trip.id == lost.tripId &&
          trip.driverId == null &&
          !proposals.any((p) => p.id == lost.id) &&
          (lost.confirmExpiresAt == null ||
              !DateTime.now().isBefore(lost.confirmExpiresAt!))) {
        showErrorSnack('El conductor no confirmó; elige otra oferta');
      }
      _lastAccepted = accepted;

      setState(() {
        _trip = trip;
        if (trip != null) _noDriverTrip = null;
        _scheduled = scheduled;
        _proposals = proposals;
        _loading = false;
        _error = null;
        // Éxito: resetea el contador de fallos y marca tiempo del éxito.
        _failureCount = 0;
        _lastSuccessAt = DateTime.now();
      });

      // Tiempo real: seguir el viaje que se muestra.
      _syncHubTrip(trip?.id ?? widget.tripId);

      // Fin de viaje: getActive() ya no lo devuelve (completado/cancelado).
      // Si venía de un estado activo, verificamos si se COMPLETÓ para mostrar
      // el popup de calificación.
      // También si estaba buscando conductor: Bugie pudo cancelarlo porque
      // nadie lo aceptó (o el conductor lo canceló).
      if (trip == null &&
          prevTrip != null &&
          _completionHandledTripId != prevTrip.id &&
          (prevTrip.status == TripStatus.inProgress ||
              prevTrip.status == TripStatus.accepted ||
              prevTrip.status == TripStatus.sosActive ||
              prevTrip.status == TripStatus.pending ||
              prevTrip.status == TripStatus.negotiating)) {
        _completionHandledTripId = prevTrip.id;
        _handleTripFinished(prevTrip);
      } else if (trip == null &&
          prevTrip == null &&
          _finishedById != null &&
          _isNoDriverCancel(_finishedById!)) {
        // Abierto desde el aviso "Nadie aceptó tu pedido" (?trip=<id>).
        setState(() => _noDriverTrip = _finishedById);
      }

      // El conductor avisó que llegó (por si el push no llegó): una vez por viaje.
      if (trip != null &&
          trip.status == TripStatus.accepted &&
          trip.driverArrivedAt != null &&
          _arrivedShownTripId != trip.id) {
        _arrivedShownTripId = trip.id;
        _showDriverArrivedDialog();
      }

      // Ajusta el tracking de ubicación del pasajero al nuevo estado.
      // Un programado que aún no llega su hora no necesita la ubicación.
      _syncPassengerTracking(trip != null && trip.isFutureScheduled ? null : trip);

      if (trip != null) {
        final key = _routeKeyFor(trip);
        if (key != _lastRouteKey) {
          _lastRouteKey = key;
          _calculateRoute(trip);
        }
      }

      // Evaluar desvío de ruta (solo si viaje inProgress y hay ruta + posición).
      _evaluateDeviation(trip);
    } on ApiException catch (e) {
      // Distinguir error de red vs error HTTP del backend.
      if (mounted) {
        setState(() {
          _loading = false;
          if (e.isNetwork) {
            // Falla de red: incrementa contador para activar backoff y banner.
            _failureCount = (_failureCount + 1).clamp(0, 10);
            // No sobrescribimos _trip/_proposals con vacíos: mantenemos
            // los últimos datos para que el usuario los siga viendo.
          } else {
            // Error real del backend (4xx/5xx): mostrar mensaje.
            _error = e.message;
          }
        });
      }
    } catch (_) {
      // Cualquier otro error inesperado: tratarlo como falla de red.
      if (mounted) {
        setState(() {
          _loading = false;
          _failureCount = (_failureCount + 1).clamp(0, 10);
        });
      }
    } finally {
      // Reagenda el siguiente poll con el intervalo que toque
      // (normal si éxito, backoff si fallo).
      if (mounted) _scheduleNext();
    }
  }

  String _routeKeyFor(Trip t) {
    final wp = t.waypoints
        .map((w) => '${w.lat.toStringAsFixed(5)},${w.lng.toStringAsFixed(5)}')
        .join('|');
    return '${t.originLat},${t.originLng}-${t.destLat},${t.destLng}-$wp';
  }

  Future<void> _calculateRoute(Trip t) async {
    final repo = context.read<TripsRepository>();
    try {
      RouteInfo info;
      final sortedWp = [...t.waypoints]
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

      if (sortedWp.isEmpty) {
        info = await repo.getRoute(
          originLat: t.originLat,
          originLng: t.originLng,
          destLat: t.destLat,
          destLng: t.destLng,
        );
      } else {
        info = await repo.getRouteWithWaypoints([
          LatLng(t.originLat, t.originLng),
          ...sortedWp.map((w) => LatLng(w.lat, w.lng)),
          LatLng(t.destLat, t.destLng),
        ]);
      }
      if (mounted) setState(() => _routeInfo = info);
    } catch (_) {}
  }

  // ── Acciones de negociación ────────────────────────────────────────────
  // Todas pasan por _act: una sola a la vez (anti doble toque), rueda en el
  // botón pulsado y, al terminar (bien o mal), se recargan viaje y ofertas.
  // Con error se muestra el mensaje del backend tal cual.

  /// Ejecuta una acción sobre la oferta [id]. Devuelve true si salió bien.
  Future<bool> _act(String id, String kind, Future<void> Function() action,
      {String? success}) async {
    if (_actingId != null || _trip == null) return false;
    setState(() {
      _actingId = id;
      _actingKind = kind;
    });
    var ok = false;
    try {
      await action();
      ok = true;
      if (success != null) showSuccessSnack(success);
    } on ApiException catch (e) {
      showErrorSnack(e.message);
    } catch (_) {
      showErrorSnack('No se pudo completar la acción. Intenta de nuevo.');
    } finally {
      if (mounted) {
        setState(() {
          _actingId = null;
          _actingKind = null;
        });
      }
    }
    if (mounted) await _load();
    return ok;
  }

  /// "Elegir a este conductor": el conductor aceptó mi precio; al elegirlo
  /// el viaje queda asignado (confirm-driver-acceptance).
  Future<void> _confirmDriverAcceptance(String proposalId) async {
    final tripId = _trip?.id;
    if (tripId == null) return;
    await _act(proposalId, 'choose', () => context
        .read<TripsRepository>()
        .confirmDriverAcceptance(tripId, proposalId));
  }

  /// "Aceptar": acepto la oferta del conductor (accept-proposal). No asigna:
  /// el conductor tiene hasta confirmExpiresAt para confirmar.
  Future<void> _acceptProposal(String proposalId) async {
    final tripId = _trip?.id;
    if (tripId == null) return;
    await _act(proposalId, 'accept',
        () => context.read<TripsRepository>().acceptProposal(tripId, proposalId),
        success: 'Aceptaste la oferta. Esperamos la confirmación del conductor.');
  }

  /// "Deshacer": la oferta que acepté vuelve a pendiente (cancel-acceptance)
  /// y puedo elegir otra. Se guarda en BD (auditoría). Pide confirmación.
  Future<void> _cancelAcceptance(String proposalId) async {
    final tripId = _trip?.id;
    if (tripId == null || _actingId != null) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Deshacer la aceptación?'),
        content: const Text(
            'La oferta volverá a estar pendiente y podrás elegir otra.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Seguir esperando'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: BugieColors.warning),
            child: const Text('Sí, deshacer'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    await _act(proposalId, 'undo',
        () => context.read<TripsRepository>().cancelAcceptance(tripId, proposalId));
  }

  /// "Rechazar" una oferta del conductor (pending o driver_accepted) o
  /// "Retirarla" (mi contraoferta). Queda rejected/passenger.
  Future<void> _rejectOne(String proposalId) async {
    final tripId = _trip?.id;
    if (tripId == null) return;
    await _act(proposalId, 'reject',
        () => context.read<TripsRepository>().rejectOneProposal(tripId, proposalId));
  }

  /// Rechaza TODAS las ofertas del viaje (pending y driver_accepted).
  Future<void> _rejectAll() async {
    final tripId = _trip?.id;
    if (tripId == null || _actingId != null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Rechazar todas las propuestas?'),
        content: const Text(
            'Los conductores recibirán el aviso. Podrás seguir recibiendo propuestas nuevas.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('No')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Rechazar todas')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _act(_actAll, 'reject-all',
        () => context.read<TripsRepository>().rejectAllProposals(tripId));
  }

  /// Rango permitido para contraofertar en este viaje.
  String? _counterError(double? fare) {
    final t = _trip;
    if (fare == null) return FareRules.invalidAmount;
    if (t == null) return null;
    return _fareRules.rangeError(fare, t.fareForRange);
  }

  /// "Contraofertar" / "Cambiar contraoferta": hoja para enviar un monto a
  /// un conductor que ofertó. Valida el rango antes de enviar.
  Future<void> _counterPropose(Proposal p, {double? quickFare}) async {
    final t = _trip;
    if (t == null || _actingId != null) return;
    // Chip de contraoferta rápida: confirmación breve y se envía directo
    // con la misma llamada que la hoja "Otro monto".
    if (quickFare != null) {
      final err = _counterError(quickFare);
      if (err != null) {
        showErrorSnack(err);
        return;
      }
      final ok = await confirmQuickFare(context,
          fare: quickFare, recipient: p.driverName);
      if (!ok || !mounted) return;
      await _sendCounter(p, quickFare);
      return;
    }
    final hint = _fareRules.rangeHint(t.fareForRange);
    final controller = TextEditingController(text: p.fare.toStringAsFixed(2));
    final result = await showModalBottomSheet<double>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(builder: (ctx, setSheet) {
          final value = FareRules.parse(controller.text);
          final error = _counterError(value);
          return SingleChildScrollView(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 16,
              bottom: MediaQuery.of(ctx).viewInsets.bottom +
                  MediaQuery.of(ctx).padding.bottom +
                  16,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.isCounterFromMe ? 'Cambiar contraoferta' : 'Contraofertar',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(
                  'Envía tu monto a ${p.driverName}.',
                  style: const TextStyle(
                      fontSize: 12, color: BugieColors.textMuted),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  autofocus: true,
                  onChanged: (_) => setSheet(() {}),
                  decoration: InputDecoration(
                    prefixText: 'S/ ',
                    helperText: hint,
                    errorText: controller.text.trim().isEmpty ? null : error,
                    errorMaxLines: 2,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: SecondaryActionButton(
                        label: 'Cancelar',
                        color: BugieColors.textMuted,
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: PrimaryActionButton(
                        icon: Icons.send_rounded,
                        label: 'Enviar',
                        color: BugieColors.primary,
                        onPressed: error != null
                            ? null
                            : () => Navigator.pop(ctx, value),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        });
      },
    );
    if (result == null || !mounted) return;
    await _sendCounter(p, result);
  }

  /// Envía la contraoferta del pasajero a un conductor (counter).
  Future<void> _sendCounter(Proposal p, double fare) async {
    final tripId = _trip?.id;
    if (tripId == null) return;
    await _act(p.id, 'counter',
        () => context.read<TripsRepository>().counterPropose(
              tripId: tripId,
              driverId: p.driverId,
              fare: fare,
            ),
        success: 'Contraoferta enviada.');
  }

  /// Viaje por id (programado): terminado o cancelado se trata como "sin viaje".
  Future<Trip?> _loadById(TripsRepository repo, String id) async {
    try {
      final t = await repo.getTracking(id);
      if (t.status == TripStatus.completed || t.status == TripStatus.cancelled) {
        _finishedById = t;
        return null;
      }
      _finishedById = null;
      return t;
    } on ApiException catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  /// Programado cuyo conductor no llegó: vuelve a pendiente para otros
  /// conductores (se quita al conductor y se le avisa).
  Future<void> _republish() async {
    if (_trip == null) return;
    final noun = _trip!.isDelivery ? 'envío' : 'viaje';
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Republicar el $noun'),
        content: const Text(
            'Quitaremos a tu conductor y otros conductores podrán enviarte propuestas de nuevo.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('No, esperar')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Sí, republicar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _republishing = true);
    try {
      final t = await context.read<TripsRepository>().republish(_trip!.id);
      if (!mounted) return;
      setState(() => _trip = t);
      showSuccessSnack('Listo: los conductores ya pueden verlo de nuevo.');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _republishing = false);
    }
  }

  /// El pasajero cancela. Se pide el motivo (mismo patrón que el conductor:
  /// opciones rápidas + texto libre) y se envía al backend (máx. 200).
  Future<void> _cancel() async {
    if (_trip == null || _actingId != null) return;
    final noun = _trip!.isDelivery ? 'envío' : 'viaje';
    final late = _trip!.driverLate;
    const otro = 'Otro motivo';
    final motivos = [
      // Conductor tarde en un programado: el motivo propio va primero.
      if (late) 'El conductor no llegó a la hora programada',
      'Ya no necesito el $noun',
      'El conductor tarda mucho',
      'Encontré otra opción',
      'Me equivoqué en los datos',
      otro,
    ];
    String elegido = motivos.first;
    final otroCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text('Cancelar $noun'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(late
                    ? 'Tu conductor no llegó a la hora programada: puedes cancelar sin penalidad. ¿Por qué cancelas?'
                    : '¿Por qué cancelas este $noun?'),
                const SizedBox(height: 8),
                for (final m in motivos)
                  RadioListTile<String>(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(m),
                    value: m,
                    groupValue: elegido,
                    onChanged: (v) => setD(() => elegido = v!),
                  ),
                if (elegido == otro)
                  TextField(
                    controller: otroCtrl,
                    maxLength: 200,
                    decoration:
                        const InputDecoration(hintText: 'Escribe el motivo'),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Volver')),
            ElevatedButton(
                style: ElevatedButton.styleFrom(
                    backgroundColor: BugieColors.danger),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Sí, cancelar')),
          ],
        ),
      ),
    );
    var motivo = elegido == otro ? otroCtrl.text.trim() : elegido;
    otroCtrl.dispose();
    if (confirmed != true || !mounted) return;
    if (motivo.isEmpty) motivo = otro;
    if (motivo.length > 200) motivo = motivo.substring(0, 200);
    try {
      await context.read<TripsRepository>().cancel(_trip!.id, reason: motivo);
      if (!mounted) return;
      context.go('/passenger');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  /// Modal con el histórico de propuestas del conductor.
  Future<void> _openHistory(String driverId, String driverName) async {
    if (_trip == null) return;
    await showDialog(
      context: context,
      builder: (_) => _HistoryDialog(
        tripId: _trip!.id,
        driverId: driverId,
        driverName: driverName,
      ),
    );
  }

  // ── UI ─────────────────────────────────────────────────────────────────

  /// Header de la pantalla de seguimiento.
  /// Antes tenía botones de perfil + logout que se duplicaban con otras
  /// pantallas. Ahora usa el header global compacto (hamburguesa, logo,
  /// campanita) — todas las acciones de cuenta viven en el drawer.
  PreferredSizeWidget _appBar() {
    return const BugieInternalHeader(title: 'Seguimiento');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: _appBar(),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_trip == null && _noDriverTrip != null) {
      return _noDriverScreen(_noDriverTrip!);
    }

    if (_trip == null) {
      return Scaffold(
        appBar: _appBar(),
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.directions_car_outlined,
                      size: 64, color: BugieColors.textMuted),
                  const SizedBox(height: 12),
                  const Text('No tienes viajes activos',
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  const Text(
                      'Cuando solicites un viaje podrás ver el seguimiento aquí.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: BugieColors.textMuted)),
                  const SizedBox(height: 20),
                  PrimaryActionButton(
                    icon: Icons.add_location_alt,
                    label: 'Solicitar viaje',
                    color: BugieColors.primary,
                    onPressed: () => context.go('/passenger/request'),
                  ),
                  // Programados que todavía no empiezan
                  if (_scheduled.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text('Tus programados',
                          style: TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(height: 8),
                    for (final s in _scheduled)
                      Card(
                        child: ListTile(
                          leading: Icon(
                              s.isDelivery ? Icons.inventory_2 : Icons.directions_car,
                              color: s.driverId != null
                                  ? BugieColors.success
                                  : BugieColors.warning),
                          title: Text(Schedule.format(s.scheduledAt!),
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(
                              '${s.driverId != null ? 'Conductor asignado' : (s.status == TripStatus.negotiating ? 'Recibiendo propuestas' : 'Buscando conductor')}'
                              '\n${s.originAddress} → ${s.destAddress}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => context.push('/passenger/tracking?trip=${s.id}'),
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
    }

    final t = _trip!;
    final sortedWp = [...t.waypoints]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    final markers = <BugieMarker>[
      BugieMarker(
        position: LatLng(t.originLat, t.originLng),
        kind: MarkerKind.origin,
      ),
      ...sortedWp.asMap().entries.map((e) => BugieMarker(
            position: LatLng(e.value.lat, e.value.lng),
            kind: MarkerKind.waypoint,
            waypointIndex: e.key,
          )),
      BugieMarker(
        position: LatLng(t.destLat, t.destLng),
        kind: MarkerKind.destination,
      ),
      // Marker del conductor (cuando el viaje está accepted/inProgress y tiene posición).
      // Usa el pin especial de auto verde (igual visual al admin web) para
      // diferenciarlo claramente de origen/destino/paradas.
      if (t.driverCurrentLat != null && t.driverCurrentLng != null)
        BugieMarker(
          position: LatLng(t.driverCurrentLat!, t.driverCurrentLng!),
          kind: MarkerKind.driver,
        ),
    ];

    List<LatLng> routePoints = [];
    if (_routeInfo != null && _routeInfo!.options.isNotEmpty) {
      routePoints = _routeInfo!.options.first.coordinates;
    }

    // Solo las ofertas vigentes: rechazadas / reemplazadas / canceladas
    // desaparecen (también la oferta que el conductor retiró).
    final visible = _proposals
        .where((p) =>
            !_hiddenIds.contains(p.id) &&
            (p.status == 'pending' ||
                p.status == 'driver_accepted' ||
                p.status == 'accepted_by_passenger'))
        .toList();

    // ¿Hay alguna propuesta de este viaje esperando que el conductor confirme?
    // Si sí, el pasajero NO puede aceptar otra.
    final waitingConfirmation = _proposals
        .where((p) => p.isWaitingDriverConfirmation)
        .toList();
    final hasWaitingConfirmation = waitingConfirmation.isNotEmpty;

    // Oferta del pasajero: lo que él ofreció (estimatedFare). No usar
    // proposedFare: es la primera propuesta de un conductor.
    final myOffer = t.passengerOfferFare ?? t.estimatedFare;
    // "Buscando conductores…": viaje pendiente/negociando sin conductor.
    final searching = t.driverId == null &&
        (t.status == TripStatus.pending ||
            t.status == TripStatus.negotiating);

    // "Rechazar todas" solo si hay 2+ ofertas del conductor (pending o
    // driver_accepted; sin contar mis contraofertas).
    final actionablePending = visible
        .where((p) =>
            (p.status == 'pending' && !p.isCounterFromMe) ||
            p.status == 'driver_accepted')
        .length;

    // Resumen del viaje: estado, conductor, direcciones, tarifa (+ envío).
    List<Widget> statusSection() => [
              // ── Estado ─────────────────────────────────────────────
              BugieCard(
                title: 'Estado',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Estado + tipo de servicio (Viaje / Envío).
                    Row(
                      children: [
                        Flexible(
                          child: AnimatedSwitcher(
                            duration: motionDuration(context, 300),
                            transitionBuilder: (child, a) => FadeTransition(
                              opacity: a,
                              child: ScaleTransition(
                                  scale: Tween(begin: 0.9, end: 1.0).animate(a),
                                  child: child),
                            ),
                            child: Container(
                              key: ValueKey(_statusLabel(t)),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: _statusColor(t.status)
                                    .withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                _statusLabel(t),
                                style: TextStyle(
                                  color: _statusColor(t.status),
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        ServiceBadge(isDelivery: t.isDelivery),
                      ],
                    ),
                    // ── Conductor asignado: foto, nombre, auto, placa ──
                    if ((t.status == TripStatus.accepted ||
                            t.status == TripStatus.inProgress ||
                            t.status == TripStatus.sosActive) &&
                        (t.driverName != null || t.vehiclePlate != null)) ...[
                      const SizedBox(height: 12),
                      _AssignedDriverCard(trip: t),
                    ],
                    const SizedBox(height: 14),
                    _AddressRow(
                      color: BugieColors.mapOrigin,
                      label: 'Origen',
                      address: t.originAddress,
                    ),
                    ...sortedWp.asMap().entries.map((e) => Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: _AddressRow(
                            color: BugieColors.mapWaypoint,
                            label: 'Parada ${e.key + 1}',
                            address: e.value.address,
                          ),
                        )),
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: _AddressRow(
                        color: BugieColors.mapDestination,
                        label: 'Destino',
                        address: t.destAddress,
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Cupon aplicado a este viaje, si lo hay. Va antes de la
                    // tarifa porque cambia lo que el pasajero va a pagar.
                    _CouponRow(trip: t, onChanged: _reloadTrip),

                    Row(
                      children: [
                        _Kpi(
                          label: t.discountAmount != null ? 'Pagas' : 'Tarifa',
                          value: 'S/ ${(t.discountAmount != null
                              ? (t.fareBeforeDiscount ?? t.estimatedFare) - t.discountAmount!
                              : t.estimatedFare).toStringAsFixed(2)}',
                        ),
                        const SizedBox(width: 8),
                        _Kpi(
                          label: 'Conductor',
                          value:
                              t.driverId != null ? 'Asignado' : 'Buscando…',
                          icon: t.driverId != null ? Icons.check : null,
                          iconColor: BugieColors.success,
                        ),
                        if (sortedWp.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          _Kpi(
                            label: 'Paradas',
                            value: '${sortedWp.length}',
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // ── Tu envío: paquete, destinatario, estado y fotos ──────────
              if (t.isDelivery) ...[
                BugieCard(
                  title: 'Tu envío',
                  child: DeliveryInfo(trip: t),
                ),
                const SizedBox(height: 14),
              ],

    ];

    return Scaffold(
      appBar: _appBar(),
      // Estilo Uber: mapa fullscreen detrás + DraggableScrollableSheet
      // adelante con toda la información. El usuario puede expandir/colapsar
      // el sheet para ver más mapa o más contenido.
      body: Stack(
        children: [
          // ── MAPA FULLSCREEN ─────────────────────────────────────────
          // Va de borde a borde, tapado parcialmente por el sheet inferior.
          // Mantiene la misma config (markers, ruta, alerta de desvío).
          Positioned.fill(
            child: BugieMap(
              height: MediaQuery.of(context).size.height,
              markers: markers,
              route: routePoints,
              // Empujamos los botones del mapa hacia arriba para que NO
              // queden tapados por el DraggableScrollableSheet (que arranca
              // en ~42% de la altura). 44% deja los botones flotando justo
              // arriba del borde superior del sheet.
              controlsBottomOffset:
                  MediaQuery.of(context).size.height * 0.44,
              // Línea roja punteada entre el conductor y el punto más
              // cercano de la ruta. Solo se dibuja cuando hay desvío
              // detectado (status inProgress + conductor a >500m).
              alertLine: (_isDeviated &&
                      _deviationNearest != null &&
                      t.driverCurrentLat != null &&
                      t.driverCurrentLng != null)
                  ? [
                      LatLng(t.driverCurrentLat!, t.driverCurrentLng!),
                      _deviationNearest!,
                    ]
                  : const [],
              center: LatLng(t.originLat, t.originLng),
              fitBoundsOnMarkers: true,
              fitOnReady: true,
              fitPadding: EdgeInsets.fromLTRB(
                  48, 110, 72, MediaQuery.of(context).size.height * 0.46),
            ),
          ),

          // ── BOTÓN SOS FLOTANTE (siempre visible durante el viaje) ────
          // Rojo, sobre el mapa. La CONFIRMACIÓN y activación real ocurren
          // en /passenger/sos (evita disparos accidentales).
          Positioned(
            top: 12,
            right: 12,
            child: Material(
              color: const Color(0xFFDC2626),
              shape: const StadiumBorder(),
              elevation: 4,
              child: InkWell(
                customBorder: const StadiumBorder(),
                onTap: () => context.push('/passenger/sos'),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.emergency_share, color: Colors.white, size: 18),
                      SizedBox(width: 6),
                      Text('SOS',
                          style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1)),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── SHEET DESPLEGABLE CON TODO EL CONTENIDO ─────────────────
          // initialChildSize: 0.42  -> arranca mostrando ~42% (mapa = 58%)
          // minChildSize:     0.18  -> mínimo (queda visible solo el header)
          // maxChildSize:     0.95  -> casi pantalla completa al expandir
          DraggableScrollableSheet(
            controller: _sheetCtrl,
            initialChildSize: 0.42,
            minChildSize: 0.18,
            maxChildSize: 0.95,
            snap: true,
            snapSizes: const [0.18, 0.42, 0.95],
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(24),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.15),
                      blurRadius: 20,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    // Handle (barra para arrastrar).
                    // Lo envolvemos en un GestureDetector que mueve el sheet
                    // manualmente. Sin esto, arrastrar desde el handle no
                    // hace nada porque el DraggableScrollableSheet solo
                    // escucha gestos en su scrollable interno (el ListView).
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onVerticalDragUpdate: (details) {
                        // dy positivo = arrastrar HACIA ABAJO → sheet más chico.
                        // dy negativo = arrastrar HACIA ARRIBA → sheet más grande.
                        final screenH = MediaQuery.of(context).size.height;
                        if (screenH <= 0) return;
                        final delta = -details.delta.dy / screenH;
                        final next = (_sheetCtrl.size + delta).clamp(0.18, 0.95);
                        _sheetCtrl.jumpTo(next);
                      },
                      onVerticalDragEnd: (_) {
                        // Al soltar, vamos al snap más cercano.
                        const snaps = [0.18, 0.42, 0.95];
                        final current = _sheetCtrl.size;
                        var closest = snaps.first;
                        var minDiff = (current - closest).abs();
                        for (final s in snaps) {
                          final d = (current - s).abs();
                          if (d < minDiff) {
                            minDiff = d;
                            closest = s;
                          }
                        }
                        _sheetCtrl.animateTo(
                          closest,
                          duration: const Duration(milliseconds: 200),
                          curve: Curves.easeOut,
                        );
                      },
                      // El handle visual: barrita gris al centro. Le damos
                      // padding amplio para que sea fácil de "agarrar".
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        alignment: Alignment.center,
                        color: Colors.transparent,
                        child: Container(
                          width: 44,
                          height: 5,
                          decoration: BoxDecoration(
                            color: BugieColors.textMuted.withValues(alpha: 0.45),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                    ),
                    // Info de la ruta (distancia/duración) si hay
                    if (_routeInfo != null && _routeInfo!.options.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '${_routeInfo!.options.first.distanceKm.toStringAsFixed(1)} km · '
                          '${_routeInfo!.options.first.durationMinutes.round()} min'
                          '${_routeInfo!.isFallback ? " (aproximado)" : ""}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: BugieColors.textMuted,
                          ),
                        ),
                      ),
                    // Contenido scrolleable: TODO lo que antes estaba en el
                    // ListView de la pantalla. Mismo orden, mismas cards,
                    // mismas alertas. Solo cambió el contenedor.
                    Expanded(
                      child: RefreshIndicator(
                        onRefresh: _load,
                        child: ListView(
                          controller: scrollController,
                          padding: const EdgeInsets.fromLTRB(20, 4, 20, 48),
                          children: [
              // Banner "sin conexión" — aparece tras 2+ fallos seguidos.
              // Mantiene los últimos datos visibles, pero avisa al usuario.
              if (_isOffline) ...[
                _OfflineBanner(lastSuccessAt: _lastSuccessAt, onRetry: _load),
                const SizedBox(height: 12),
              ],

              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: BugieColors.danger.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: BugieColors.danger.withOpacity(0.35)),
                  ),
                  child: Text(_error!,
                      style: const TextStyle(color: BugieColors.danger)),
                ),
                const SizedBox(height: 12),
              ],

              // ── Programado ─────────────────────────────────────────
              if (t.isScheduled && !t.driverLate) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: BugieColors.primary.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: BugieColors.primary.withOpacity(0.3)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.event_available, color: BugieColors.primary),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Programado para el ${Schedule.format(t.scheduledAt!)}',
                                style: const TextStyle(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 2),
                            Text(
                              t.status == TripStatus.accepted
                                  ? (t.isFutureScheduled
                                      ? 'Tu conductor ya está asignado. Te recordaremos 30 y 10 minutos antes.'
                                      : 'Ya casi es la hora: tu conductor se prepara para ir.')
                                  : 'Los conductores pueden enviarte propuestas desde ahora.',
                              style: const TextStyle(
                                  fontSize: 12, color: BugieColors.textMuted),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],

              // ── El conductor del programado no llegó ───────────────
              if (t.driverLate) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: BugieColors.danger.withOpacity(0.10),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: BugieColors.danger.withOpacity(0.35)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('Tu conductor no llegó a la hora programada',
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: BugieColors.danger)),
                      const SizedBox(height: 4),
                      Text(
                          'Era para el ${Schedule.format(t.scheduledAt!)}. Puedes cancelar sin penalidad '
                          'o republicarlo para que lo tome otro conductor.',
                          style: const TextStyle(fontSize: 12)),
                      const SizedBox(height: 10),
                      PrimaryActionButton(
                        label: 'Republicar',
                        icon: Icons.refresh,
                        loading: _republishing,
                        onPressed: _republishing ? null : _republish,
                      ),
                      const SizedBox(height: 4),
                      DestructiveTextButton(
                        expand: true,
                        label: 'Cancelar sin penalidad',
                        onPressed: _republishing ? null : _cancel,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],

              // ── (Va primero: es lo que más importa mientras esperas.)
              // ── Distancia del conductor (solo cuando ESTÁ EN CAMINO al pasajero,
              // es decir status accepted). Una vez "pasajero a bordo" (inProgress)
              // ya no tiene sentido mostrar distancia entre ellos: el conductor
              // está llevando al pasajero, no acercándose a él. ───────────────
              if (t.driverCurrentLat != null &&
                  t.driverCurrentLng != null &&
                  t.status == TripStatus.accepted) ...[
                _DriverDistanceCard(
                  trip: t,
                ),
                const SizedBox(height: 14),
              ],

              // ── Estado (resumen del viaje) ─────────────────────────
              // Con conductor asignado va arriba; mientras se busca
              // conductor va DESPUÉS de las ofertas (lo urgente primero).
              if (!searching) ...statusSection(),

              // ── Banner de desvío de ruta (solo durante inProgress) ────────
              // Aparece si el conductor se aleja >500m de la ruta planificada.
              // Acompaña a la línea roja punteada que se dibuja en el mapa
              // (en _routeInfo + alertLine).
              if (_isDeviated && t.status == TripStatus.inProgress) ...[
                _DeviationAlertBanner(distanceMeters: _deviationDistance),
                const SizedBox(height: 14),
              ],

              // ── "Buscando conductores…" (radar) ─────────────────────
              // Mientras el viaje espera conductor y nadie fue aceptado aún.
              AnimatedSwitcher(
                duration: motionDuration(context, 300),
                child: (searching && !hasWaitingConfirmation)
                    ? Padding(
                        key: const ValueKey('searching'),
                        padding: const EdgeInsets.only(bottom: 14),
                        child: PulseSearching(
                          text: visible.isEmpty
                              ? 'Buscando conductores…'
                              : 'Esperando más ofertas…',
                          subtitle: visible.isEmpty
                              ? 'Te avisaremos cuando un conductor te haga una oferta.'
                              : 'Puedes aceptar una oferta cuando quieras.',
                          icon: t.isDelivery
                              ? Icons.inventory_2_rounded
                              : Icons.local_taxi_rounded,
                        ),
                      )
                    : const SizedBox.shrink(key: ValueKey('no-search')),
              ),

              // ── Si nadie acepta, Bugie cancela el pedido ────────────
              if (searching &&
                  t.expiresAt != null &&
                  t.expiresReason == 'no_driver_timeout') ...[
                Align(
                  alignment: Alignment.centerLeft,
                  child: ExpiryCountdown(
                    expiresAt: t.expiresAt!,
                    reason: t.expiresReason,
                    textBuilder: (clock) =>
                        'Si nadie acepta, tu pedido se cancelará en $clock',
                    onExpired: _load,
                  ),
                ),
                const SizedBox(height: 14),
              ],

              // ── Cards de propuestas ────────────────────────────────
              if (visible.isNotEmpty) ...[
                // Encabezado: "Ofertas para tu viaje" + "Tu oferta: S/ X".
                Padding(
                  padding: const EdgeInsets.only(left: 2, bottom: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(
                    t.isDelivery
                        ? 'Ofertas para tu envío'
                        : 'Ofertas para tu viaje',
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                        color: context.bugie.text),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AnimatedSwitcher(
                              duration: motionDuration(context, 250),
                              child: Text(
                                visible.length == 1
                                    ? '1 conductor te respondió'
                                    : '${visible.length} conductores te respondieron',
                                key: ValueKey(visible.length),
                                style: TextStyle(
                                    fontSize: 12.5,
                                    color: context.bugie.textMuted),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: PriceTag(
                          amount: myOffer,
                          label: 'Tu oferta',
                          fontSize: 20,
                          alignment: CrossAxisAlignment.end,
                        ),
                      ),
                    ],
                  ),
                    ],
                  ),
                ),
                AnimatedItemsColumn<Proposal>(
                  items: visible,
                  keyOf: (p) => p.id,
                  spacing: 12,
                  itemBuilder: (ctx, p, _) => _ProposalCard(
                    proposal: p,
                    acceptDisabled: hasWaitingConfirmation,
                    busy: _actingId != null,
                    actingKind: _actingId == p.id ? _actingKind : null,
                    onUndo: () => _cancelAcceptance(p.id),
                    onExpired: _load,
                    favoriteDriverIds: _favoriteDriverIds,
                    myOffer: myOffer,
                    // Chips: -1, +1, +2 sobre el precio que propone el
                    // conductor (solo los que caen en el rango permitido).
                    quickFares: quickFares(
                      base: p.fare,
                      deltas: const [-1, 1, 2],
                    ).where((f) => _counterError(f) == null).toList(),
                    onAccept: () => p.isDirectAccept
                        ? _confirmDriverAcceptance(p.id)
                        : _acceptProposal(p.id),
                    onReject: () => _rejectOne(p.id),
                    onCounter: () => _counterPropose(p),
                    onQuickCounter: (fare) =>
                        _counterPropose(p, quickFare: fare),
                    onHide: () => setState(() => _hiddenIds.add(p.id)),
                    onShowHistory: () =>
                        _openHistory(p.driverId, p.driverName),
                  ),
                ),
                if (actionablePending > 1)
                  Center(
                    child: DestructiveTextButton(
                      label: 'Rechazar todas las propuestas',
                      icon: Icons.clear_all_rounded,
                      loading: _actingId == _actAll,
                      onPressed: _actingId != null ? null : _rejectAll,
                    ),
                  ),
                const SizedBox(height: 14),
              ],

              if (searching) ...statusSection(),

              // (El mapa ahora vive en el Stack de fondo, no acá.
              //  La info de ruta — distancia/duración — quedó dentro del
              //  sheet, arriba del scroll, para no perderla.)

              // Un programado aceptado también se puede cancelar mientras el
              // conductor no haya llegado (si no llegó, desde el aviso de arriba).
              if (t.status == TripStatus.pending ||
                  t.status == TripStatus.negotiating ||
                  (t.isScheduled &&
                      t.status == TripStatus.accepted &&
                      t.driverArrivedAt == null &&
                      !t.driverLate))
                DestructiveTextButton(
                  expand: true,
                  icon: Icons.close_rounded,
                  label: t.isDelivery ? 'Cancelar envío' : 'Cancelar viaje',
                  onPressed: _actingId != null ? null : _cancel,
                ),

              if (t.status != TripStatus.completed &&
                  t.status != TripStatus.cancelled) ...[
                const SizedBox(height: 12),
                const Center(
                  child: Text(
                    'Solo en caso de emergencia real',
                    style:
                        TextStyle(fontSize: 12, color: BugieColors.textMuted),
                  ),
                ),
                const SizedBox(height: 6),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: BugieColors.danger,
                    minimumSize: const Size(0, 52),
                    side: const BorderSide(
                        color: BugieColors.danger, width: 1.4),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: () => context.push('/passenger/sos'),
                  icon: const Icon(Icons.warning_amber_rounded),
                  label: const Text('SOS — Emergencia',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
              const SizedBox(height: 40),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  /// Bugie canceló el pedido porque nadie lo aceptó a tiempo.
  Widget _noDriverScreen(Trip t) {
    return Scaffold(
      appBar: _appBar(),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cancel_outlined,
                    size: 64, color: BugieColors.danger),
                const SizedBox(height: 12),
                Text(t.isDelivery ? 'Envío cancelado' : 'Viaje cancelado',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text('Nadie aceptó tu pedido. Puedes volver a pedirlo.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: context.bugie.textMuted)),
                const SizedBox(height: 20),
                PrimaryActionButton(
                  icon: Icons.refresh,
                  label: 'Volver a pedir',
                  color: BugieColors.primary,
                  onPressed: () => context.go(t.isDelivery
                      ? '/passenger/delivery'
                      : '/passenger/request'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Estado para el pasajero. En envíos dice "envío" en vez de "viaje".
  String _statusLabel(Trip t) {
    if (t.isDelivery) {
      switch (t.status) {
        case TripStatus.accepted:   return 'Conductor en camino al recojo';
        case TripStatus.inProgress: return 'Envío en curso';
      }
    }
    return TripStatus.labelForPassenger(t.status);
  }

  Color _statusColor(int s) {
    switch (s) {
      case TripStatus.pending:     return Colors.orange;
      case TripStatus.accepted:    return BugieColors.primary;
      case TripStatus.inProgress:  return BugieColors.success;
      case TripStatus.completed:   return BugieColors.success;
      case TripStatus.cancelled:   return BugieColors.textMuted;
      case TripStatus.sosActive:   return BugieColors.danger;
      case TripStatus.negotiating: return BugieColors.primary;
      default:                     return BugieColors.textMuted;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Card de propuesta — adapta su apariencia según estado
// ─────────────────────────────────────────────────────────────────────────

class _ProposalCard extends StatefulWidget {
  final Proposal proposal;
  /// "Aceptar" (oferta del conductor) o "Elegir a este conductor"
  /// (driver_accepted), según el estado.
  final VoidCallback onAccept;
  /// "Rechazar" la oferta o "Retirarla" (mi contraoferta).
  final VoidCallback onReject;
  /// Abre la hoja "Otro monto" (contraoferta libre / cambiar contraoferta).
  final VoidCallback onCounter;
  /// Contraoferta rápida con un monto de los chips.
  final ValueChanged<double> onQuickCounter;
  /// "Deshacer" la aceptación (accepted_by_passenger).
  final VoidCallback onUndo;
  /// Venció el plazo del conductor para confirmar: recargar.
  final VoidCallback onExpired;
  final VoidCallback onHide;
  final VoidCallback onShowHistory;
  /// Si true, "Aceptar" (oferta pending del conductor) se deshabilita porque
  /// ya acepté otra oferta de este viaje que espera confirmación.
  final bool acceptDisabled;
  /// Hay una acción de negociación en curso (en esta u otra tarjeta):
  /// todos los botones quedan deshabilitados.
  final bool busy;
  /// Botón de ESTA tarjeta que está trabajando (rueda giratoria), o null.
  final String? actingKind;
  /// Set de IDs de conductores favoritos del pasajero, para marcar con ⭐.
  final Set<String> favoriteDriverIds;
  /// Oferta vigente del pasajero (el precio se resalta si difiere).
  final double myOffer;
  /// Montos rápidos de contraoferta ya calculados (pueden ser vacíos).
  final List<double> quickFares;

  const _ProposalCard({
    required this.proposal,
    required this.onAccept,
    required this.onReject,
    required this.onCounter,
    required this.onQuickCounter,
    required this.onUndo,
    required this.onExpired,
    required this.onHide,
    required this.onShowHistory,
    required this.myOffer,
    required this.quickFares,
    this.acceptDisabled = false,
    this.busy = false,
    this.actingKind,
    this.favoriteDriverIds = const {},
  });

  @override
  State<_ProposalCard> createState() => _ProposalCardState();
}

class _ProposalCardState extends State<_ProposalCard> {
  /// Muestra la fila de chips de contraoferta.
  bool _countering = false;

  @override
  Widget build(BuildContext context) {
    final p = widget.proposal;
    final isMine = p.isCounterFromMe && p.status == 'pending';
    final isDirect = p.isDirectAccept;
    final isWaiting = p.isWaitingDriverConfirmation;
    final busy = widget.busy;
    final acting = widget.actingKind;
    final c = context.bugie;

    // Color de borde/avatar según estado
    final accentColor = isMine
        ? BugieColors.warning
        : (isDirect || isWaiting)
            ? BugieColors.success
            : BugieColors.proposal;

    // Iniciales del conductor para el avatar (si no tiene foto).
    final initials = p.driverName
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((s) => s.isEmpty ? '' : s[0].toUpperCase())
        .join();

    // Etiqueta legible del vehículo: "Toyota Yaris Rojo"
    final vehicleSummary = p.vehicleSummary;

    // Chips de estado / tiempo (izquierda de la fila del precio).
    final meta = <Widget>[
      if (isDirect)
        InfoChip(
          icon: Icons.check_circle,
          text: 'Aceptó tu precio ${formatSoles(p.fare)}',
          color: BugieColors.success,
        )
      else if (!isMine && !isWaiting)
        InfoChip(
          icon: Icons.local_offer_outlined,
          text: 'Ofrece ${formatSoles(p.fare)}',
          color: BugieColors.proposal,
        ),
      InfoChip(icon: Icons.access_time, text: _timeAgo(p.createdAt)),
      if (!isDirect && !isMine && !isWaiting && p.trend != ProposalTrend.isNew)
        _TrendBadge(trend: p.trend),
    ];

    // Contraofertar: chips rápidos + "Otro monto" (oferta del conductor o
    // aceptación de mi precio).
    Widget counterRow() => AnimatedSize(
          duration: motionDuration(context, 220),
          alignment: Alignment.topCenter,
          child: _countering
              ? Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('Elige tu contraoferta',
                          style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: c.textMuted)),
                      const SizedBox(height: 6),
                      FareChips(
                        fares: widget.quickFares,
                        referenceFare: p.fare,
                        enabled: !busy,
                        onSelected: widget.onQuickCounter,
                        onOther: widget.onCounter,
                      ),
                    ],
                  ),
                )
              : const SizedBox(width: double.infinity),
        );

    // Fila "Rechazar" + "Contraofertar".
    Widget rejectCounterRow() => Row(
          children: [
            Expanded(
              flex: 2,
              child: DestructiveTextButton(
                expand: true,
                label: 'Rechazar',
                icon: Icons.close_rounded,
                loading: acting == 'reject',
                onPressed: busy ? null : widget.onReject,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 3,
              child: SecondaryActionButton(
                label: _countering ? 'Ocultar' : 'Contraofertar',
                icon: _countering ? Icons.expand_less : Icons.swap_horiz,
                color: BugieColors.warning,
                loading: acting == 'counter',
                onPressed: busy
                    ? null
                    : () => setState(() => _countering = !_countering),
              ),
            ),
          ],
        );

    Widget? footer;
    if (isWaiting) {
      // La acepté: espera la confirmación del conductor hasta confirmExpiresAt.
      footer = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: p.confirmExpiresAt != null
                ? ExpiryCountdown(
                    expiresAt: p.confirmExpiresAt!,
                    reason: 'proposal_confirm',
                    textBuilder: (clock) =>
                        'Esperando que ${p.driverName} confirme · $clock',
                    // Al vencer, recargar: el backend dirá si confirmó o no.
                    onExpired: widget.onExpired,
                  )
                : InfoChip(
                    icon: Icons.hourglass_top,
                    text: 'Esperando que ${p.driverName} confirme',
                    color: BugieColors.primary,
                  ),
          ),
          const SizedBox(height: 10),
          SecondaryActionButton(
            label: 'Deshacer',
            icon: Icons.undo,
            color: BugieColors.warning,
            loading: acting == 'undo',
            onPressed: busy ? null : widget.onUndo,
          ),
        ],
      );
    } else if (isMine) {
      // Mi contraoferta a este conductor (el monto que le envié).
      footer = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: BugieColors.warning.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.swap_horiz,
                    size: 18, color: BugieColors.warning),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Tu contraoferta ${formatSoles(p.fare)} · esperando al conductor',
                    maxLines: 2,
                    style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: BugieColors.warning),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                flex: 2,
                child: DestructiveTextButton(
                  expand: true,
                  label: 'Retirarla',
                  icon: Icons.close_rounded,
                  loading: acting == 'reject',
                  onPressed: busy ? null : widget.onReject,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 3,
                child: SecondaryActionButton(
                  label: 'Cambiar contraoferta',
                  icon: Icons.edit_outlined,
                  color: BugieColors.warning,
                  loading: acting == 'counter',
                  onPressed: busy ? null : widget.onCounter,
                ),
              ),
            ],
          ),
        ],
      );
    } else if (isDirect) {
      // Aceptó mi precio: al elegirlo queda asignado.
      footer = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PrimaryActionButton(
            label: 'Elegir a este conductor',
            icon: Icons.check_rounded,
            loading: acting == 'choose',
            onPressed: busy ? null : widget.onAccept,
          ),
          const SizedBox(height: 8),
          counterRow(),
          rejectCounterRow(),
        ],
      );
    } else {
      // Oferta del conductor.
      footer = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          PrimaryActionButton(
            label: 'Aceptar',
            icon: Icons.check_rounded,
            loading: acting == 'accept',
            onPressed: busy || widget.acceptDisabled ? null : widget.onAccept,
          ),
          if (widget.acceptDisabled) ...[
            const SizedBox(height: 6),
            Text(
              'Ya aceptaste otra oferta. Deshaz esa aceptación para aceptar esta.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: c.textMuted),
            ),
          ],
          const SizedBox(height: 8),
          counterRow(),
          rejectCounterRow(),
        ],
      );
    }

    return ProposalCard(
      avatar: _DriverAvatar(
        photoUrl: p.driverPhotoUrl,
        initials: initials,
        accentColor: accentColor,
      ),
      name: p.driverName,
      nameLeading: widget.favoriteDriverIds.contains(p.driverId)
          ? Tooltip(
              message: 'Conductor favorito',
              child: Icon(Icons.star, size: 16, color: Colors.amber.shade600),
            )
          : null,
      subtitle: vehicleSummary,
      plate: p.vehiclePlate,
      rating: p.driverRating,
      ratingCount: p.driverRatingCount,
      showNewWhenNoRating: true,
      fare: p.fare,
      referenceFare: widget.myOffer,
      previousFare: p.previousFare,
      borderColor: (isMine || isDirect || isWaiting)
          ? accentColor.withValues(alpha: 0.5)
          : null,
      topRight: IconButton(
        visualDensity: VisualDensity.compact,
        tooltip: 'Histórico',
        icon: Icon(Icons.history, size: 20, color: c.textMuted),
        onPressed: widget.onShowHistory,
      ),
      meta: meta,
      footer: footer,
    );
  }

  String _timeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inSeconds < 60) return 'hace ${diff.inSeconds}s';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    if (diff.inHours < 24)   return 'hace ${diff.inHours} h';
    return 'hace ${diff.inDays} d';
  }
}

class _TrendBadge extends StatelessWidget {
  final ProposalTrend trend;
  const _TrendBadge({required this.trend});

  @override
  Widget build(BuildContext context) {
    final isDown = trend == ProposalTrend.down;
    final color = isDown ? BugieColors.trendDown : BugieColors.trendUp;
    final icon = isDown ? Icons.arrow_downward : Icons.arrow_upward;
    final label = isDown ? 'Bajó' : 'Subió';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 2),
        Text(label,
            style: TextStyle(
                color: color, fontSize: 11, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Modal histórico (read-only)
// ─────────────────────────────────────────────────────────────────────────

class _HistoryDialog extends StatefulWidget {
  final String tripId;
  final String driverId;
  final String driverName;
  const _HistoryDialog({
    required this.tripId,
    required this.driverId,
    required this.driverName,
  });

  @override
  State<_HistoryDialog> createState() => _HistoryDialogState();
}

class _HistoryDialogState extends State<_HistoryDialog> {
  List<ProposalHistoryEntry> _entries = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await context
          .read<TripsRepository>()
          .getProposalHistory(widget.tripId, widget.driverId);
      if (mounted) setState(() { _entries = list; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Color _colorForStatus(String s) {
    switch (s) {
      case 'pending':    return BugieColors.proposal;
      case 'superseded': return BugieColors.statusSuperseded;
      case 'accepted':   return BugieColors.trendDown;
      case 'rejected':   return BugieColors.trendUp;
      default:           return BugieColors.textMuted;
    }
  }

  String _timeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inSeconds < 60) return 'hace ${diff.inSeconds}s';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    if (diff.inHours < 24)   return 'hace ${diff.inHours} h';
    return 'hace ${diff.inDays} d';
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      // Insets para que el diálogo respete los bordes en pantallas chicas.
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
      // Clip antialias evita que el contenido (ej. scroll del body) se pinte
      // fuera del borde redondeado del modal.
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420, maxHeight: 560),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
              decoration: const BoxDecoration(
                border: Border(
                    bottom: BorderSide(color: BugieColors.border)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.history, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Historial — ${widget.driverName}',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 15),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            // Body — scrolleable. El Clip del Dialog asegura que el
            // contenido no se pinte fuera del borde redondeado.
            Flexible(
              child: Scrollbar(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Todas las propuestas, contrapropuestas y rechazos de esta negociación.',
                        style: TextStyle(
                            fontSize: 12, color: BugieColors.textMuted),
                      ),
                      const SizedBox(height: 12),

                    if (_loading)
                      const Center(
                          child: Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(),
                      ))
                    else if (_entries.isEmpty)
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('No hay registros.',
                              style: TextStyle(color: BugieColors.textMuted)),
                        ),
                      )
                    else
                      ..._entries.map((h) {
                        final color = _colorForStatus(h.status);
                        final isCurrent = h.status == 'pending';
                        final isCounter = h.proposedByRole == 'passenger';
                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: BugieColors.surface,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Opacity(
                            opacity: isCurrent ? 1 : 0.75,
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      // Línea 1: monto
                                      Text(
                                        'S/ ${h.fare.toStringAsFixed(2)}',
                                        style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            color: color,
                                            fontSize: 16),
                                      ),
                                      // Línea 2 (solo si es contrapropuesta): badge naranja
                                      // Va en su propia fila para que no compita
                                      // de ancho con el tiempo + el badge de estado.
                                      if (isCounter)
                                        Padding(
                                          padding:
                                              const EdgeInsets.only(top: 2),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: const [
                                              Icon(Icons.swap_horiz,
                                                  size: 12,
                                                  color: Colors.orange),
                                              SizedBox(width: 4),
                                              Flexible(
                                                child: Text(
                                                  'Tu contrapropuesta',
                                                  style: TextStyle(
                                                      fontSize: 11,
                                                      color: Colors.orange,
                                                      fontWeight:
                                                          FontWeight.w600),
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      // Línea final: timeAgo
                                      Padding(
                                        padding: const EdgeInsets.only(top: 2),
                                        child: Text(
                                          _timeAgo(h.createdAt),
                                          style: const TextStyle(
                                              fontSize: 11,
                                              color: BugieColors.textMuted),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: color,
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Text(
                                    h.statusLabel,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                  ],
                ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers visuales compartidos
// ─────────────────────────────────────────────────────────────────────────

class _AddressRow extends StatelessWidget {
  final Color color;
  final String label;
  final String address;
  const _AddressRow({
    required this.color,
    required this.label,
    required this.address,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: TextStyle(fontSize: 13, color: c.text),
              children: [
                TextSpan(
                  text: '$label: ',
                  style: TextStyle(color: c.textMuted),
                ),
                TextSpan(
                  text: address,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Kpi extends StatelessWidget {
  final String label;
  final String value;
  final IconData? icon;
  final Color? iconColor;

  const _Kpi({
    required this.label,
    required this.value,
    this.icon,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: c.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: c.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: TextStyle(fontSize: 11, color: c.textMuted)),
            const SizedBox(height: 2),
            Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 14, color: iconColor),
                  const SizedBox(width: 4),
                ],
                Flexible(
                  child: Text(value,
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: c.text),
                      overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Banner "sin conexión"
// Aparece cuando hay 2+ fallos consecutivos por red. Muestra hace cuánto
// fue la última actualización exitosa y permite reintentar manual.
// ─────────────────────────────────────────────────────────────────────────

class _OfflineBanner extends StatelessWidget {
  final DateTime? lastSuccessAt;
  final VoidCallback onRetry;
  const _OfflineBanner({required this.lastSuccessAt, required this.onRetry});

  String _staleText() {
    if (lastSuccessAt == null) return 'sin actualizar';
    final diff = DateTime.now().difference(lastSuccessAt!);
    if (diff.inSeconds < 60) return 'hace ${diff.inSeconds}s';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    return 'hace ${diff.inHours} h';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.orange.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off, color: Colors.orange, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Sin conexión',
                  style: TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 13),
                ),
                Text(
                  'Última actualización ${_staleText()}',
                  style: const TextStyle(
                      fontSize: 11, color: BugieColors.textMuted),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              foregroundColor: Colors.orange,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              minimumSize: const Size(0, 32),
            ),
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Reintentar',
                style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Card "Distancia del conductor"
// Muestra qué tan cerca está el conductor del pasajero usando la última
// posición conocida (que ya viene en el trip desde el backend, sin pedir
// peticiones extra).
//
// Para "posición del pasajero" usamos el GPS local si lo tenemos,
// con fallback al origen del viaje.
// ─────────────────────────────────────────────────────────────────────────

class _DriverDistanceCard extends StatelessWidget {
  final Trip trip;
  const _DriverDistanceCard({required this.trip});

  /// Convierte metros a string amigable: "150 m", "1.2 km".
  String _formatDistance(double meters) {
    if (meters < 1000) return '${meters.round()} m';
    return '${(meters / 1000).toStringAsFixed(1)} km';
  }

  /// Estima minutos para recorrer una distancia en LÍNEA RECTA.
  /// Aplica dos correcciones porque la línea recta subestima mucho el ETA real:
  ///   1. Factor 1.4: por las calles uno no va en línea recta — recorre más
  ///      distancia siguiendo el trazado urbano. 1.4 es un factor típico para
  ///      ciudades con cuadrícula como Trujillo/Tacna.
  ///   2. Velocidad 15 km/h: promedio realista en zonas urbanas con tráfico,
  ///      semáforos y velocidad legal de 30-50 km/h. Antes usábamos 25 km/h
  ///      pero daba estimaciones muy optimistas (1 km → 2 min, irreal).
  String _formatEta(double straightLineMeters) {
    const avgKmh = 15.0;
    const streetFactor = 1.4;
    final realMeters = straightLineMeters * streetFactor;
    final minutes = (realMeters / 1000) / avgKmh * 60;
    if (minutes < 1) return '<1 min';
    if (minutes < 60) return '~${minutes.round()} min';
    return '~${(minutes / 60).toStringAsFixed(1)} h';
  }

  @override
  Widget build(BuildContext context) {
    final driverLat = trip.driverCurrentLat!;
    final driverLng = trip.driverCurrentLng!;

    // Posición del pasajero: GPS local si disponible, sino el origen del viaje.
    // El servicio expone la última posición ya guardada — no hace peticiones.
    final tracking = context.read<LocationTrackingService>();
    final lastPos = tracking.lastKnownPosition;
    final passengerLat = lastPos?.latitude ?? trip.originLat;
    final passengerLng = lastPos?.longitude ?? trip.originLng;

    final meters = Geolocator.distanceBetween(
      passengerLat, passengerLng,
      driverLat, driverLng,
    );

    final isInTrip = trip.status == TripStatus.inProgress;
    final color = isInTrip ? BugieColors.success : BugieColors.primary;

    return BugieCard(
      title: isInTrip ? 'Conductor (en camino al destino)' : 'Conductor en camino',
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.directions_car, color: color, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _formatDistance(meters),
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
                Text(
                  isInTrip
                      ? 'Distancia hasta tu conductor'
                      : 'Distancia hasta ti · ${_formatEta(meters)}',
                  style: const TextStyle(
                      fontSize: 12, color: BugieColors.textMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Banner de alerta cuando el conductor se desvía >500m de la ruta planeada.
// Se acompaña con una línea roja punteada en el mapa.
// ─────────────────────────────────────────────────────────────────────────

class _DeviationAlertBanner extends StatelessWidget {
  final double distanceMeters;
  const _DeviationAlertBanner({required this.distanceMeters});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: BugieColors.danger.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BugieColors.danger.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded,
              color: BugieColors.danger, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Tu conductor se está desviando',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: BugieColors.danger,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'A ${distanceMeters.round()} m de la ruta planificada. Revisa el mapa.',
                  style: const TextStyle(
                      fontSize: 12, color: BugieColors.textMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Avatar del conductor: muestra su foto si la tiene, con fallback a iniciales.
class _DriverAvatar extends StatelessWidget {
  final String? photoUrl;
  final String initials;
  final Color accentColor;
  final double size = 48;
  const _DriverAvatar({
    required this.photoUrl,
    required this.initials,
    required this.accentColor,
  });

  @override
  Widget build(BuildContext context) {
    final initialsAvatar = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [accentColor.withOpacity(0.85), accentColor],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: 16,
        ),
      ),
    );

    final resolved = ApiConfig.resolveMediaUrl(photoUrl);
    if (resolved == null || resolved.isEmpty) return initialsAvatar;

    return ClipOval(
      child: Image.network(
        resolved,
        width: size,
        height: size,
        fit: BoxFit.cover,
        // Si la foto falla al cargar, caemos a las iniciales.
        errorBuilder: (_, __, ___) => initialsAvatar,
        loadingBuilder: (ctx, child, progress) =>
            progress == null ? child : initialsAvatar,
      ),
    );
  }
}

/// Detalle del conductor asignado: foto, nombre, ★rating, auto, placa y foto
/// del vehículo. Tocar la foto del conductor o del auto la muestra en grande.
class _AssignedDriverCard extends StatelessWidget {
  final Trip trip;
  const _AssignedDriverCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final t = trip;
    final initials = (t.driverName ?? '')
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((s) => s.isEmpty ? '' : s[0].toUpperCase())
        .join();
    final vehicle = [t.vehicleBrand, t.vehicleModel, t.vehicleColor]
        .where((s) => s != null && s.isNotEmpty)
        .join(' · ');
    final driverPhoto = ApiConfig.resolveMediaUrl(t.driverPhotoUrl);
    final vehiclePhoto = ApiConfig.resolveMediaUrl(t.vehiclePhotoUrl);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: (driverPhoto != null && driverPhoto.isNotEmpty)
                    ? () => _showImagePreview(context, driverPhoto)
                    : null,
                child: _DriverAvatar(
                  photoUrl: t.driverPhotoUrl,
                  initials: initials,
                  accentColor: BugieColors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            t.driverName ?? 'Conductor',
                            style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                                color: c.text),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (t.driverRating != null) ...[
                          const SizedBox(width: 6),
                          const Icon(Icons.star, size: 14, color: Colors.amber),
                          const SizedBox(width: 2),
                          Text(t.driverRating!.toStringAsFixed(1),
                              style:
                                  TextStyle(fontSize: 12, color: c.textMuted)),
                        ],
                      ],
                    ),
                    if (vehicle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(vehicle,
                          style: TextStyle(fontSize: 13, color: c.textMuted),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ],
                    if (t.vehiclePlate != null &&
                        t.vehiclePlate!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: c.bg2,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: c.border),
                        ),
                        child: Text(
                          t.vehiclePlate!,
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.5,
                              color: c.text),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),

          // Foto del vehículo (tocar para ver grande)
          if (vehiclePhoto != null && vehiclePhoto.isNotEmpty) ...[
            const SizedBox(height: 12),
            GestureDetector(
              onTap: () => _showImagePreview(context, vehiclePhoto),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Stack(
                  children: [
                    Image.network(
                      vehiclePhoto,
                      width: double.infinity,
                      height: 150,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        height: 150,
                        color: c.bg2,
                        alignment: Alignment.center,
                        child: Icon(Icons.directions_car,
                            color: c.textMuted, size: 40),
                      ),
                    ),
                    Positioned(
                      right: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Icon(Icons.zoom_in,
                            color: Colors.white, size: 18),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Muestra una imagen a pantalla completa con zoom (tocar fuera o la X cierra).
void _showImagePreview(BuildContext context, String url) {
  showDialog(
    context: context,
    barrierColor: Colors.black87,
    builder: (ctx) => Stack(
      children: [
        GestureDetector(
          onTap: () => Navigator.pop(ctx),
          child: Center(
            child: InteractiveViewer(
              minScale: 0.8,
              maxScale: 4,
              child: Image.network(
                url,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Icon(Icons.broken_image,
                    color: Colors.white, size: 60),
              ),
            ),
          ),
        ),
        Positioned(
          top: 40,
          right: 16,
          child: IconButton(
            icon: const Icon(Icons.close, color: Colors.white, size: 28),
            onPressed: () => Navigator.pop(ctx),
          ),
        ),
      ],
    ),
  );
}

/// Popup NO cerrable que aparece cuando el viaje se completa: califica al
/// conductor (estrellas + comentario) y, opcionalmente, guarda el destino como
/// dirección favorita (nombre + ícono). Al terminar redirige al dashboard.
class _TripCompletedDialog extends StatefulWidget {
  final Trip trip;
  const _TripCompletedDialog({required this.trip});

  @override
  State<_TripCompletedDialog> createState() => _TripCompletedDialogState();
}

class _TripCompletedDialogState extends State<_TripCompletedDialog> {
  int _stars = 0;
  final _commentCtrl = TextEditingController();
  bool _saveDest = false;
  final _nameCtrl = TextEditingController();
  String _icon = 'home';
  bool _busy = false;
  bool _favDriver = false;
  String? _nameError;

  static const _iconChoices = [
    {'key': 'home', 'icon': Icons.home},
    {'key': 'work', 'icon': Icons.work},
    {'key': 'school', 'icon': Icons.school},
    {'key': 'shopping-cart', 'icon': Icons.shopping_cart},
    {'key': 'fitness', 'icon': Icons.fitness_center},
    {'key': 'restaurant', 'icon': Icons.restaurant},
    {'key': 'local_hospital', 'icon': Icons.local_hospital},
    {'key': 'heart', 'icon': Icons.favorite},
    {'key': 'star', 'icon': Icons.star},
    {'key': 'location_on', 'icon': Icons.location_on},
  ];

  @override
  void dispose() {
    _commentCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _finish({required bool rate}) async {
    if (_busy) return;
    final t = widget.trip;
    final name = _nameCtrl.text.trim();
    final favRepo = context.read<FavoritesRepository>();

    setState(() {
      _busy = true;
      _nameError = null;
    });

    // Validar nombre duplicado ANTES de guardar (no crear "Casa" repetida).
    if (_saveDest && name.isNotEmpty) {
      try {
        final existing = await favRepo.getAddresses();
        final dup = existing.any(
            (a) => a.label.trim().toLowerCase() == name.toLowerCase());
        if (dup) {
          if (mounted) {
            setState(() {
              _busy = false;
              _nameError = 'Ya tienes una dirección llamada "$name".';
            });
          }
          return; // no cerramos el modal: que corrija el nombre
        }
      } catch (_) {}
    }

    // Calificación al conductor (opcional)
    if (rate && _stars > 0) {
      try {
        await context.read<TripsRepository>().rateTrip(
              t.id,
              _stars,
              _commentCtrl.text.trim().isEmpty ? null : _commentCtrl.text.trim(),
            );
      } catch (_) {}
    }
    // Guardar destino como dirección favorita (opcional)
    if (_saveDest && name.isNotEmpty) {
      try {
        await favRepo.addAddress(
          label: name,
          icon: _icon,
          address: t.destAddress,
          lat: t.destLat,
          lng: t.destLng,
        );
      } catch (_) {}
    }
    // Agregar conductor a favoritos (opcional)
    if (_favDriver && t.driverId != null) {
      try {
        await favRepo.addDriver(t.driverId!);
      } catch (_) {}
    }

    if (!mounted) return;
    Navigator.of(context).pop();
    context.go('/passenger');
    showSuccessSnack(t.isDelivery
        ? '¡Envío completado! Gracias por confiar en Bugie.'
        : '¡Viaje completado! Gracias por viajar con Bugie.');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return PopScope(
      canPop: false,
      child: Dialog(
        backgroundColor: c.surface,
        insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.check_circle,
                  color: BugieColors.success, size: 52),
              const SizedBox(height: 10),
              Text(widget.trip.isDelivery ? '¡Envío completado!' : '¡Viaje completado!',
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: c.text)),
              const SizedBox(height: 4),
              Text('Califica a tu conductor',
                  style: TextStyle(fontSize: 14, color: c.textMuted)),
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  final filled = i < _stars;
                  // Zona táctil de 48 dp y un pequeño "salto" al marcarla.
                  return IconButton(
                    onPressed:
                        _busy ? null : () => setState(() => _stars = i + 1),
                    iconSize: 40,
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints(minWidth: 48, minHeight: 48),
                    icon: AnimatedScale(
                      scale: filled ? 1.0 : 0.9,
                      duration: motionDuration(context, 180),
                      curve: Curves.easeOutBack,
                      child: Icon(
                          filled ? Icons.star_rounded : Icons.star_border_rounded,
                          color: filled ? Colors.amber : c.textMuted),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _commentCtrl,
                enabled: !_busy,
                minLines: 1,
                maxLines: 3,
                style: TextStyle(color: c.text),
                decoration: InputDecoration(
                  hintText: 'Comentario (opcional)',
                  hintStyle: TextStyle(color: c.textMuted),
                  filled: true,
                  fillColor: c.bg2,
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: c.border)),
                  enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: c.border)),
                ),
              ),
              const SizedBox(height: 10),
              Container(
                decoration: BoxDecoration(
                  color: c.bg2,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: c.border),
                ),
                child: Column(
                  children: [
                    CheckboxListTile(
                      value: _saveDest,
                      onChanged: _busy
                          ? null
                          : (v) => setState(() => _saveDest = v ?? false),
                      activeColor: BugieColors.primary,
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 12),
                      controlAffinity: ListTileControlAffinity.leading,
                      title: Text('Guardar destino como dirección',
                          style: TextStyle(fontSize: 14, color: c.text)),
                      subtitle: Text(widget.trip.destAddress,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: c.textMuted)),
                    ),
                    if (_saveDest)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            TextField(
                              controller: _nameCtrl,
                              enabled: !_busy,
                              style: TextStyle(color: c.text),
                              decoration: InputDecoration(
                                hintText: 'Nombre (ej. Casa, Trabajo)',
                                hintStyle: TextStyle(color: c.textMuted),
                                isDense: true,
                                filled: true,
                                fillColor: c.surface,
                                border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(8),
                                    borderSide: BorderSide(color: c.border)),
                                enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(8),
                                    borderSide: BorderSide(color: c.border)),
                              ),
                            ),
                            if (_nameError != null) ...[
                              const SizedBox(height: 6),
                              Text(_nameError!,
                                  style: TextStyle(
                                      color: Colors.red.shade400,
                                      fontSize: 12)),
                            ],
                            const SizedBox(height: 8),
                            SizedBox(
                              height: 42,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: _iconChoices.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(width: 8),
                                itemBuilder: (_, i) {
                                  final ch = _iconChoices[i];
                                  final key = ch['key'] as String;
                                  final sel = key == _icon;
                                  return GestureDetector(
                                    onTap: _busy
                                        ? null
                                        : () => setState(() => _icon = key),
                                    child: Container(
                                      width: 42,
                                      decoration: BoxDecoration(
                                        color: sel
                                            ? BugieColors.primary
                                            : c.surface,
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                            color: sel
                                                ? BugieColors.primary
                                                : c.border),
                                      ),
                                      child: Icon(ch['icon'] as IconData,
                                          size: 20,
                                          color:
                                              sel ? Colors.white : c.textMuted),
                                    ),
                                  );
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              if (widget.trip.driverId != null) ...[
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: c.bg2,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: c.border),
                  ),
                  child: CheckboxListTile(
                    value: _favDriver,
                    onChanged: _busy
                        ? null
                        : (v) => setState(() => _favDriver = v ?? false),
                    activeColor: BugieColors.primary,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                    controlAffinity: ListTileControlAffinity.leading,
                    secondary: Icon(Icons.favorite,
                        color: _favDriver ? Colors.red : c.textMuted),
                    title: Text('Agregar conductor a favoritos',
                        style: TextStyle(fontSize: 14, color: c.text)),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: _busy ? null : () => _finish(rate: false),
                      child: Text('Omitir',
                          style: TextStyle(color: c.textMuted)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: PrimaryActionButton(
                      label: 'Enviar',
                      loading: _busy,
                      onPressed: (_busy || _stars == 0)
                          ? null
                          : () => _finish(rate: true),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/* ── Cupon aplicado al viaje ───────────────────────────────────────────── */

/// Muestra el cupon si lo hay, y si no, el boton para elegir uno.
///
/// Solo aparece con el viaje ACEPTADO o EN CURSO: antes no hay precio que
/// descontar, y despues ya se cobro.
class _CouponRow extends StatefulWidget {
  final Trip trip;
  final Future<void> Function() onChanged;
  const _CouponRow({required this.trip, required this.onChanged});

  @override
  State<_CouponRow> createState() => _CouponRowState();
}

class _CouponRowState extends State<_CouponRow> {
  bool _busy = false;

  /// Aviso de cupones de nivel: beneficios por reclamar este mes o cupones
  /// de nivel ya reclamados y vigentes. Solo informa; no cambia el cupón.
  bool _avisoPedido = false;
  bool _puedeReclamar = false;
  bool _tieneCuponNivel = false;

  /// Tipos que descuentan sobre la tarifa (los mismos de la hoja de cupones).
  static const _aplicables = {'discount_amount', 'free_trip', 'discount_period'};

  bool get _puedeUsar =>
      widget.trip.status == TripStatus.accepted ||
      widget.trip.status == TripStatus.inProgress;

  @override
  void initState() {
    super.initState();
    if (_puedeUsar) _cargarAviso();
  }

  @override
  void didUpdateWidget(covariant _CouponRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_avisoPedido && _puedeUsar) _cargarAviso();
  }

  /// Consulta si hay cupones de nivel. Si falla, simplemente no hay aviso.
  Future<void> _cargarAviso() async {
    _avisoPedido = true;
    final repo = context.read<RewardsRepository>();
    try {
      final r = await Future.wait([
        repo.getLevelBenefits().then<bool>((b) => b.eligible && b.canClaim)
            .catchError((_) => false),
        repo.getMyRedemptions(status: 'active', pageSize: 50)
            .then<bool>((p) => p.items.any((c) =>
                c.isLevelBenefit && _aplicables.contains(c.rewardType)))
            .catchError((_) => false),
      ]);
      if (!mounted) return;
      setState(() {
        _puedeReclamar   = r[0];
        _tieneCuponNivel = r[1];
      });
    } catch (_) {
      // El aviso es complementario.
    }
  }

  double get _tarifa =>
      widget.trip.fareBeforeDiscount ?? widget.trip.estimatedFare;

  Future<void> _elegir() async {
    final r = await showApplyCouponSheet(
      context,
      tripId: widget.trip.id,
      fare: _tarifa,
    );
    if (r == null || !mounted) return;
    _cargarAviso();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: BugieColors.success,
        content: Text(r.warning ??
            'Cupón aplicado. Pagas S/ ${r.amountToPay.toStringAsFixed(2)}.'),
      ),
    );
    await widget.onChanged();
  }

  Future<void> _quitar() async {
    setState(() => _busy = true);
    try {
      await context.read<TripsRepository>().removeCoupon(widget.trip.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cupón quitado. Vuelve a estar disponible.')),
      );
      _cargarAviso();
      await widget.onChanged();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: BugieColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    if (!_puedeUsar) return const SizedBox.shrink();

    final descuento = widget.trip.discountAmount;

    // Sin cupon: el boton para elegir uno (y el aviso de cupones de nivel).
    if (descuento == null) {
      final aviso = _puedeReclamar || _tieneCuponNivel;
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (aviso)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Material(
                  color: BugieColors.primary.withOpacity(.10),
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    // Con cupon ya reclamado se elige aqui mismo; si falta
                    // reclamarlo, se va a Mis puntos.
                    onTap: _tieneCuponNivel
                        ? _elegir
                        : () => context.push('/passenger/rewards?tab=summary'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      child: Row(children: [
                        const Icon(Icons.workspace_premium,
                            size: 18, color: BugieColors.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _tieneCuponNivel
                                ? 'Tienes cupones de tu nivel disponibles'
                                : 'Tienes cupones de tu nivel disponibles. '
                                  'Reclámalos en Mis puntos.',
                            style: const TextStyle(
                                fontSize: 12.5, fontWeight: FontWeight.w600),
                          ),
                        ),
                        Icon(Icons.chevron_right, size: 18, color: c.textMuted),
                      ]),
                    ),
                  ),
                ),
              ),
            OutlinedButton.icon(
              onPressed: _elegir,
              icon: const Icon(Icons.local_offer_outlined, size: 17),
              label: const Text('Usar un cupón'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(42),
                side: BorderSide(color: c.border),
              ),
            ),
          ],
        ),
      );
    }

    // Con cupon: el desglose, para que sepa exactamente que va a pagar.
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BugieColors.success.withOpacity(.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BugieColors.success.withOpacity(.35)),
      ),
      child: Column(children: [
        Row(children: [
          const Icon(Icons.local_offer, size: 17, color: BugieColors.success),
          const SizedBox(width: 8),
          Expanded(
            child: Text('Cupón ${widget.trip.couponCode ?? ""}',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          ),
          if (_busy)
            const SizedBox(width: 16, height: 16,
                child: CircularProgressIndicator(strokeWidth: 2))
          else
            TextButton(
              onPressed: _quitar,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Quitar', style: TextStyle(fontSize: 12.5)),
            ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Text('Tarifa', style: TextStyle(fontSize: 12.5, color: c.textMuted)),
          const Spacer(),
          Text('S/ ${_tarifa.toStringAsFixed(2)}',
              style: TextStyle(fontSize: 12.5, color: c.textMuted)),
        ]),
        const SizedBox(height: 3),
        Row(children: [
          const Text('Descuento', style: TextStyle(fontSize: 12.5)),
          const Spacer(),
          Text('− S/ ${descuento.toStringAsFixed(2)}',
              style: const TextStyle(
                  fontSize: 12.5,
                  color: BugieColors.success,
                  fontWeight: FontWeight.w700)),
        ]),
      ]),
    );
  }
}
