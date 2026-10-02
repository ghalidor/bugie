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
import '../../../core/theme/bugie_theme.dart';
import 'apply_coupon_sheet.dart';
import '../../../core/ui/app_messenger.dart';
import '../../../core/utils/route_geometry.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../trips/data/trips_repository.dart';
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
  const PassengerTrackingScreen({super.key});

  @override
  State<PassengerTrackingScreen> createState() => _PassengerTrackingScreenState();
}

class _PassengerTrackingScreenState extends State<PassengerTrackingScreen>
    with WidgetsBindingObserver {
  Trip? _trip;
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

  String? _lastRouteKey;

  /// IDs de cards que el usuario ocultó manualmente (X).
  /// Solo aplica a "el conductor declinó". No se persiste.
  final Set<String> _hiddenIds = {};

  /// True si hay problemas de red sostenidos (2+ fallos seguidos).
  bool get _isOffline => _failureCount >= 2;

  // ── Detección de desvío de ruta (solo inProgress) ─────────────────────

  /// Umbral en metros: si el conductor está más lejos que esto de la
  /// ruta más cercana, consideramos que está desviado.
  static const double _deviationThresholdMeters = 500;

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
    _load();
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

  Future<void> _loadFavoriteDrivers() async {
    try {
      final ids = await context.read<FavoritesRepository>().getFavoriteDriverIds();
      if (mounted) setState(() => _favoriteDriverIds = ids);
    } catch (_) {
      // sin favoritos, no rompemos
    }
  }

  /// Lee del admin si la detección de desvío está activada.
  /// Si la red falla, se queda en el default (false) — seguro.
  Future<void> _loadDeviationFlag() async {
    try {
      final enabled = await context
          .read<AdminSettingsService>()
          .getBool('deviation_detection_enabled', fallback: false);
      if (mounted) setState(() => _deviationFeatureEnabled = enabled);
    } catch (_) {/* default false ya cubre el caso */}
  }

  @override
  void dispose() {
    FcmService.driverArrived.removeListener(_onDriverArrivedPush);
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

    final driverPos = LatLng(trip!.driverCurrentLat!, trip.driverCurrentLng!);
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
      final has = await Vibration.hasVibrator() ?? false;
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

  /// Llegó el push "tu conductor llegó": refresca el viaje y muestra el aviso.
  /// Si el conductor vuelve a avisar, se muestra de nuevo.
  void _onDriverArrivedPush() {
    if (!mounted || FcmService.driverArrived.value == null) return;
    _load();
    _showDriverArrivedDialog();
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
    bool completed = false;
    try {
      final history = await repo.getHistory();
      for (final t in history) {
        if (t.id == prev.id) {
          completed = t.status == TripStatus.completed;
          break;
        }
      }
    } catch (_) {}
    if (!completed) return; // cancelado u otro: no calificamos

    // ¿ya lo calificó antes? entonces solo volvemos al dashboard.
    try {
      final existing = await repo.getTripRating(prev.id);
      if (existing != null) {
        if (mounted) {
          context.go('/passenger');
          showSuccessSnack('¡Viaje completado!');
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

  Future<void> _load() async {
    // Si la app está en background, no hacemos request.
    if (!_isForeground) return;

    final repo = context.read<TripsRepository>();
    try {
      final trip = await repo.getActive();

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
      setState(() {
        _trip = trip;
        _proposals = proposals;
        _loading = false;
        _error = null;
        // Éxito: resetea el contador de fallos y marca tiempo del éxito.
        _failureCount = 0;
        _lastSuccessAt = DateTime.now();
      });

      // Fin de viaje: getActive() ya no lo devuelve (completado/cancelado).
      // Si venía de un estado activo, verificamos si se COMPLETÓ para mostrar
      // el popup de calificación.
      if (trip == null &&
          prevTrip != null &&
          _completionHandledTripId != prevTrip.id &&
          (prevTrip.status == TripStatus.inProgress ||
              prevTrip.status == TripStatus.accepted ||
              prevTrip.status == TripStatus.sosActive)) {
        _completionHandledTripId = prevTrip.id;
        _handleTripFinished(prevTrip);
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
      _syncPassengerTracking(trip);

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

  Future<void> _confirmDriverAcceptance(String proposalId) async {
    try {
      await context
          .read<TripsRepository>()
          .confirmDriverAcceptance(_trip!.id, proposalId);
      // El poll refrescará el trip a Accepted y mostrará al conductor asignado.
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('No se pudo confirmar. Intenta de nuevo.')));
      }
    }
  }

  Future<void> _acceptProposal(String proposalId) async {
    if (_trip == null) return;
    try {
      await context.read<TripsRepository>().acceptProposal(_trip!.id, proposalId);

      // FLUJO NUEVO: aceptar una propuesta YA NO asigna conductor automáticamente.
      // Solo marca la propuesta como 'accepted_by_passenger' y queda
      // esperando que el conductor confirme con /confirm-acceptance.
      // El pasajero ve "Esperando confirmación del conductor..." y no puede
      // aceptar otras propuestas hasta que el conductor confirme o esto expire.
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.hourglass_top, color: Colors.white, size: 18),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Esperando confirmación del conductor...'),
                ),
              ],
            ),
            backgroundColor: BugieColors.warning,
            duration: Duration(seconds: 3),
          ),
        );
      }

      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  /// Deshace la aceptación de una propuesta. La propuesta vuelve a 'pending'
  /// y el pasajero puede aceptar otra. Se guarda en BD (auditoría).
  /// Pide confirmación antes para evitar accidentes.
  Future<void> _cancelAcceptance(String proposalId) async {
    if (_trip == null) return;

    // Diálogo de confirmación: este es un cambio que tiene auditoría.
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('¿Cambiar de opinión?'),
        content: const Text(
          'La propuesta volverá a estar pendiente y podrás aceptar otra. '
          'El conductor todavía podría confirmar si lo hace antes que tú '
          'aceptes a otro.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('No, esperar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: BugieColors.warning),
            child: const Text('Sí, cambiar de opinión'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await context.read<TripsRepository>().cancelAcceptance(_trip!.id, proposalId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Listo. Ya puedes aceptar otra propuesta.'),
            duration: Duration(seconds: 2),
          ),
        );
      }
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  /// Rechaza UNA propuesta del conductor. La propuesta queda como rejected/passenger
  /// (el conductor verá feedback "el pasajero rechazó").
  Future<void> _rejectOne(String proposalId) async {
    if (_trip == null) return;
    try {
      await context.read<TripsRepository>().rejectOneProposal(_trip!.id, proposalId);
      // En el próximo poll vuelve enriquecido si el conductor responde con otra propuesta.
      setState(() {
        _proposals = _proposals.where((p) => p.id != proposalId).toList();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  /// Rechaza TODAS las propuestas pending del viaje.
  Future<void> _rejectAll() async {
    if (_trip == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Rechazar todas'),
        content: const Text(
            '¿Rechazar todas las propuestas? Los conductores recibirán el aviso.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('No')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Sí, rechazar')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await context.read<TripsRepository>().rejectAllProposals(_trip!.id);
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  /// Abre el bottom sheet para que el pasajero proponga un monto distinto
  /// hacia un conductor específico.
  Future<void> _counterPropose(Proposal p) async {
    if (_trip == null) return;
    final controller = TextEditingController(text: p.fare.toStringAsFixed(2));
    final result = await showModalBottomSheet<double>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Contrapropuesta',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
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
                decoration: InputDecoration(
                  prefixText: 'S/ ',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Cancelar'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.send, size: 16),
                      label: const Text('Enviar'),
                      onPressed: () {
                        final v = double.tryParse(
                            controller.text.replaceAll(',', '.'));
                        if (v == null || v <= 0) {
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            const SnackBar(
                                content: Text('Ingresa un monto válido.')),
                          );
                          return;
                        }
                        Navigator.pop(ctx, v);
                      },
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );

    if (result == null) return;
    try {
      await context.read<TripsRepository>().counterPropose(
            tripId: _trip!.id,
            driverId: p.driverId,
            fare: result,
          );
      // El próximo poll trae el nuevo card "pending + passenger".
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _cancel() async {
    if (_trip == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancelar viaje'),
        content: const Text('¿Estás seguro de cancelar este viaje?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('No')),
          ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: BugieColors.danger),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Sí, cancelar')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await context.read<TripsRepository>().cancel(_trip!.id);
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
                  ElevatedButton.icon(
                    icon: const Icon(Icons.add_location_alt),
                    label: const Text('Solicitar viaje'),
                    onPressed: () => context.go('/passenger/request'),
                  ),
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

    // Filtra cards que el usuario ocultó (X en cards declinadas).
    final visible = _proposals.where((p) => !_hiddenIds.contains(p.id)).toList();

    // ¿Hay alguna propuesta de este viaje esperando que el conductor confirme?
    // Si sí, el pasajero NO puede aceptar otra.
    final waitingConfirmation = _proposals
        .where((p) => p.isWaitingDriverConfirmation)
        .toList();
    final hasWaitingConfirmation = waitingConfirmation.isNotEmpty;
    final waitingDriverName = hasWaitingConfirmation
        ? waitingConfirmation.first.driverName
        : '';

    // Botón "Rechazar todas" solo si hay 2+ pending del conductor (sin contar mías).
    final actionablePending = visible
        .where((p) => p.status == 'pending' && !p.isCounterFromMe)
        .length;

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
                          height: 4,
                          decoration: BoxDecoration(
                            color: BugieColors.textMuted.withOpacity(0.4),
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
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 48),
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

              // ── Estado ─────────────────────────────────────────────
              BugieCard(
                title: 'Estado',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: _statusColor(t.status).withOpacity(0.15),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          TripStatus.labelForPassenger(t.status),
                          style: TextStyle(
                            color: _statusColor(t.status),
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ),
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

              // ── Banner de desvío de ruta (solo durante inProgress) ────────
              // Aparece si el conductor se aleja >500m de la ruta planificada.
              // Acompaña a la línea roja punteada que se dibuja en el mapa
              // (en _routeInfo + alertLine).
              if (_isDeviated && t.status == TripStatus.inProgress) ...[
                _DeviationAlertBanner(distanceMeters: _deviationDistance),
                const SizedBox(height: 14),
              ],

              // ── Cards de propuestas ────────────────────────────────
              if (visible.isNotEmpty) ...[
                // Banner especial: si hay una propuesta esperando confirmación
                // del conductor, lo mostramos arriba con info clara y le
                // bloqueamos al pasajero el botón "Aceptar" de las demás cards.
                if (hasWaitingConfirmation) ...[
                  BugieCard(
                    title: 'Esperando confirmación del conductor',
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.hourglass_top,
                                  color: BugieColors.warning, size: 22),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Aceptaste a $waitingDriverName.',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.bold, fontSize: 14),
                                    ),
                                    const SizedBox(height: 4),
                                    const Text(
                                      'En cuanto el conductor confirme, empieza el viaje. '
                                      'Si tarda demasiado, puedes cambiar de opinión.',
                                      style: TextStyle(
                                          fontSize: 12.5,
                                          color: BugieColors.textMuted),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          // Botón "Cambiar de opinión": vuelve la propuesta a
                          // pending y libera al pasajero para aceptar otra.
                          // Se guarda en la tabla histórica para auditoría.
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              onPressed: () =>
                                  _cancelAcceptance(waitingConfirmation.first.id),
                              icon: const Icon(Icons.undo, size: 18),
                              label: const Text('Cambiar de opinión'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: BugieColors.warning,
                                side: const BorderSide(color: BugieColors.warning),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                // Solo el TÍTULO (sin card contenedor): así cada card de
                // conductor usa todo el ancho disponible.
                Padding(
                  padding: const EdgeInsets.only(left: 2, bottom: 8),
                  child: Text(
                    visible.length > 1
                        ? '${visible.length} conductores quieren llevarte'
                        : '1 conductor quiere llevarte',
                    style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        color: context.bugie.text),
                  ),
                ),
                ...visible.map((p) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _ProposalCard(
                        proposal: p,
                        acceptDisabled: hasWaitingConfirmation,
                        favoriteDriverIds: _favoriteDriverIds,
                        onAccept: () => p.isDirectAccept
                            ? _confirmDriverAcceptance(p.id)
                            : _acceptProposal(p.id),
                        onReject: () => _rejectOne(p.id),
                        onCounter: () => _counterPropose(p),
                        onHide: () => setState(() => _hiddenIds.add(p.id)),
                        onShowHistory: () =>
                            _openHistory(p.driverId, p.driverName),
                      ),
                    )),
                if (actionablePending > 1)
                  OutlinedButton.icon(
                    onPressed: _rejectAll,
                    icon: const Icon(Icons.close, size: 16),
                    label: const Text('Rechazar todas'),
                  ),
                const SizedBox(height: 14),
              ],

              // (El mapa ahora vive en el Stack de fondo, no acá.
              //  La info de ruta — distancia/duración — quedó dentro del
              //  sheet, arriba del scroll, para no perderla.)

              if (t.status == TripStatus.pending ||
                  t.status == TripStatus.negotiating)
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  icon: const Icon(Icons.close),
                  label: const Text('Cancelar viaje'),
                  onPressed: _cancel,
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
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: BugieColors.danger,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: () => context.push('/passenger/sos'),
                  icon: const Icon(Icons.warning),
                  label: const Text('SOS — Emergencia',
                      style: TextStyle(fontWeight: FontWeight.bold)),
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

class _ProposalCard extends StatelessWidget {
  final Proposal proposal;
  final VoidCallback onAccept;
  final VoidCallback onReject;
  final VoidCallback onCounter;
  final VoidCallback onHide;
  final VoidCallback onShowHistory;
  /// Si true, el botón "Aceptar" se deshabilita porque otra propuesta de
  /// este mismo viaje ya está esperando confirmación del conductor.
  final bool acceptDisabled;
  /// Set de IDs de conductores favoritos del pasajero, para marcar con ⭐.
  /// El padre lo carga una vez y lo pasa acá. Si el conductor de esta
  /// propuesta está en este set, mostramos la corona junto al nombre.
  final Set<String> favoriteDriverIds;

  const _ProposalCard({
    required this.proposal,
    required this.onAccept,
    required this.onReject,
    required this.onCounter,
    required this.onHide,
    required this.onShowHistory,
    this.acceptDisabled = false,
    this.favoriteDriverIds = const {},
  });

  @override
  Widget build(BuildContext context) {
    final p = proposal;
    final isMine = p.isCounterFromMe;
    final isDeclined = p.isDeclinedByDriver;

    // Color de borde/avatar según estado
    final accentColor = isDeclined
        ? BugieColors.danger
        : isMine
            ? Colors.orange
            : BugieColors.proposal;

    // Iniciales del conductor para el avatar. Como el backend no devuelve
    // foto de perfil del conductor en el modelo Proposal, usamos sus
    // iniciales sobre un círculo de color.
    final initials = p.driverName
        .trim()
        .split(RegExp(r'\s+'))
        .take(2)
        .map((s) => s.isEmpty ? '' : s[0].toUpperCase())
        .join();

    // Etiqueta legible del vehículo: "Toyota Yaris · Rojo"
    final vehicleParts = <String>[
      if (p.vehicleBrand != null) p.vehicleBrand!,
      if (p.vehicleModel != null) p.vehicleModel!,
    ];
    final vehicleSummary = vehicleParts.join(' ');
    final c = context.bugie;

    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: (isDeclined || isMine)
              ? accentColor.withOpacity(0.5)
              : c.border,
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Stack(
        children: [
          // X para ocultar (solo si está declinado por el conductor)
          if (isDeclined)
            Positioned(
              top: 4,
              right: 4,
              child: IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Ocultar',
                icon: const Icon(Icons.close, size: 18),
                onPressed: onHide,
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── HEADER: avatar grande + nombre/vehículo + precio ──
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Foto del conductor (o iniciales si no tiene / falla).
                    _DriverAvatar(
                      photoUrl: p.driverPhotoUrl,
                      initials: initials,
                      accentColor: accentColor,
                    ),
                    const SizedBox(width: 12),
                    // Nombre + vehículo
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              // ⭐ Corona si está en favoritos del pasajero
                              if (favoriteDriverIds.contains(p.driverId)) ...[
                                Tooltip(
                                  message: 'Conductor favorito',
                                  child: Icon(
                                    Icons.star,
                                    size: 16,
                                    color: Colors.amber.shade600,
                                  ),
                                ),
                                const SizedBox(width: 4),
                              ],
                              Flexible(
                                child: Text(
                                  p.driverName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          if (vehicleSummary.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              vehicleSummary,
                              style: const TextStyle(
                                fontSize: 12,
                                color: BugieColors.textMuted,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                          if (p.vehiclePlate != null) ...[
                            const SizedBox(height: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: BugieColors.textMuted.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                p.vehiclePlate!,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    // Botón histórico (el precio se movió abajo, a lo ancho).
                    if (!isDeclined)
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                            minWidth: 28, minHeight: 28),
                        tooltip: 'Histórico',
                        icon: Icon(Icons.history, size: 18, color: c.textMuted),
                        onPressed: onShowHistory,
                      ),
                  ],
                ),
                const SizedBox(height: 12),

                // ── Izq: tiempo + subió/bajó | Der: monto actual + anterior ──
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Izquierda
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.access_time,
                                size: 14,
                                color: c.textMuted.withOpacity(0.7)),
                            const SizedBox(width: 4),
                            Text(_timeAgo(p.createdAt),
                                style: TextStyle(
                                    fontSize: 12, color: c.textMuted)),
                          ],
                        ),
                        if (p.isDirectAccept) ...[
                          const SizedBox(height: 4),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: const [
                              Icon(Icons.check_circle,
                                  size: 14, color: BugieColors.success),
                              SizedBox(width: 4),
                              Text('Aceptó tu viaje',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: BugieColors.success,
                                      fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ] else if (!isDeclined &&
                            p.trend != ProposalTrend.isNew) ...[
                          const SizedBox(height: 4),
                          _TrendBadge(trend: p.trend),
                        ],
                      ],
                    ),
                    const Spacer(),
                    // Derecha: monto actual (arriba) + anterior (abajo)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'S/ ${p.fare.toStringAsFixed(2)}',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: accentColor,
                            letterSpacing: -0.5,
                            decoration: isDeclined
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                        if (p.previousFare != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            'antes S/ ${p.previousFare!.toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: c.textMuted,
                              decoration: TextDecoration.lineThrough,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),

                // ── Estado (esperando respuesta / declinada), si aplica ──
                if (isMine && !isDeclined) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.orange.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text('Esperando respuesta',
                          style: TextStyle(
                              fontSize: 10,
                              color: Colors.orange,
                              fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
                if (isDeclined) ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: BugieColors.danger.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.block,
                              size: 11, color: BugieColors.danger),
                          SizedBox(width: 3),
                          Text('Declinada',
                              style: TextStyle(
                                  fontSize: 10,
                                  color: BugieColors.danger,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ],

                // ── Acciones (solo si es pending del conductor) ──────
                if (!isMine && !isDeclined) ...[
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: BugieColors.success,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      onPressed: acceptDisabled ? null : onAccept,
                      icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                      label: Text(
                        acceptDisabled
                            ? 'Esperando otro conductor'
                            : 'Aceptar viaje',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.orange,
                            side: const BorderSide(color: Colors.orange),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          onPressed: onCounter,
                          icon: const Icon(Icons.swap_horiz, size: 16),
                          label: const Text('Contraproponer',
                              style: TextStyle(fontSize: 12),
                              overflow: TextOverflow.ellipsis),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: BugieColors.danger,
                            side: const BorderSide(color: BugieColors.danger),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          onPressed: onReject,
                          icon: const Icon(Icons.close, size: 16),
                          label: const Text('Rechazar',
                              style: TextStyle(fontSize: 12)),
                        ),
                      ),
                    ],
                  ),
                ],

                // Para "declinada": acceso al histórico abajo (la X ocupa
                // la esquina superior derecha).
                if (isDeclined) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: BugieColors.textMuted,
                        side: const BorderSide(color: BugieColors.border),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      onPressed: onShowHistory,
                      icon: const Icon(Icons.history, size: 16),
                      label: const Text('Ver histórico',
                          style: TextStyle(fontSize: 12)),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
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
  final double? previousFare;
  const _TrendBadge({required this.trend, this.previousFare});

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
        if (previousFare != null) ...[
          const SizedBox(width: 4),
          Text(
            '(antes S/ ${previousFare!.toStringAsFixed(2)})',
            style:
                const TextStyle(fontSize: 10, color: BugieColors.textMuted),
          ),
        ],
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
  final double size;
  const _DriverAvatar({
    required this.photoUrl,
    required this.initials,
    required this.accentColor,
    this.size = 48,
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
    showSuccessSnack('¡Viaje completado! Gracias por viajar con Bugie.');
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
              Text('¡Viaje completado!',
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
                  return IconButton(
                    onPressed:
                        _busy ? null : () => setState(() => _stars = i + 1),
                    iconSize: 38,
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    constraints: const BoxConstraints(),
                    icon: Icon(filled ? Icons.star : Icons.star_border,
                        color: filled ? Colors.amber : c.textMuted),
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
                    child: ElevatedButton(
                      onPressed: (_busy || _stars == 0)
                          ? null
                          : () => _finish(rate: true),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: BugieColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white))
                          : const Text('Enviar'),
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

  bool get _puedeUsar =>
      widget.trip.status == TripStatus.accepted ||
      widget.trip.status == TripStatus.inProgress;

  double get _tarifa =>
      widget.trip.fareBeforeDiscount ?? widget.trip.estimatedFare;

  Future<void> _elegir() async {
    final r = await showApplyCouponSheet(
      context,
      tripId: widget.trip.id,
      fare: _tarifa,
    );
    if (r == null || !mounted) return;

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

    // Sin cupon: solo el boton para elegir uno.
    if (descuento == null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: OutlinedButton.icon(
          onPressed: _elegir,
          icon: const Icon(Icons.local_offer_outlined, size: 17),
          label: const Text('Usar un cupón'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(42),
            side: BorderSide(color: c.border),
          ),
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
