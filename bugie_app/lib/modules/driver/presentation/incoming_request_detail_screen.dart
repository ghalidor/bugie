import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/services/active_trip_service.dart';
import '../../../core/services/admin_settings_service.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/services/trips_hub_service.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_map.dart';
import '../../../core/widgets/negotiation/negotiation.dart';
import '../../../core/widgets/schedule_picker.dart';
import '../../../core/widgets/service_badge.dart';
import '../../../core/widgets/trip_photos_gallery.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/proposal_model.dart';
import '../../trips/domain/trip_photo_model.dart';
import '../../trips/domain/trip_model.dart';
import '../../../core/session/session.dart';
import 'incoming_requests_screen.dart'
    show
        ActiveTripNotice,
        DriverHistoryDialog,
        PassengerAvatar,
        shortPassengerName;
import 'widgets/new_request_banner.dart';
import 'widgets/trip_request_card_compact.dart' show haversineKm;

/// Pantalla de detalle de UNA solicitud entrante.
///
/// Layout:
///  - Mapa FULLSCREEN de fondo con la ruta del viaje + origen + destino +
///    posición del conductor.
///  - Hoja inferior con: precio grande, chips (distancia, "a X min", pago,
///    envío), origen/paradas/destino, estado de la negociación animado,
///    contraoferta rápida (chips +1/+2/+3 y "Otro monto") y UN botón
///    principal "Aceptar S/ X" con "Rechazar" como acción secundaria.
///  - Banner flotante arriba cuando llega NUEVA solicitud mientras estás
///    revisando esta — al tocarlo volvés a la lista.
///
/// Polling propio:
///  - Cada 5s si hay negociación activa, cada 10s si no.
///  - Trae todos los pending para detectar "nuevas" + counter del trip actual.
class IncomingRequestDetailScreen extends StatefulWidget {
  final String tripId;
  const IncomingRequestDetailScreen({super.key, required this.tripId});

  @override
  State<IncomingRequestDetailScreen> createState() =>
      _IncomingRequestDetailScreenState();
}

class _IncomingRequestDetailScreenState
    extends State<IncomingRequestDetailScreen> with WidgetsBindingObserver {
  Trip? _trip;
  DriverCounterInfo? _counter;
  /// Mi oferta vigente en este viaje (GET /{id}/proposals solo devuelve la
  /// mía): pending, driver_accepted (acepté su tarifa) o
  /// accepted_by_passenger (con confirmExpiresAt).
  Proposal? _myOffer;
  /// Rango permitido para proponer (base_fare / fare_max_multiplier).
  FareRules _rules = const FareRules();
  List<LatLng> _routePoints = const [];
  /// Distancia y duración del viaje (origen → destino), de la misma ruta.
  double? _routeKm;
  double? _routeMin;
  bool _loading = true;
  String? _error;

  // Polling
  Timer? _pollingTimer;
  bool _isForeground = true;

  // Acciones / negociación
  bool _isActing = false;
  bool _isProposing = false;
  late final TextEditingController _proposeCtrl;
  final Set<String> _hiddenRejects = {};
  /// Monto que se está enviando ahora mismo (para el estado "Enviando…").
  double? _sendingFare;
  /// Qué botón está trabajando: 'accept' | 'counter' | 'decline' |
  /// 'confirm' | 'propose'.
  String? _actingKind;

  // Tracking de nuevas solicitudes que llegan mientras estoy acá.
  // Guardamos los IDs vistos al entrar; si después aparece otro trip que
  // no es este y no estaba antes, lo contamos como "nueva".
  Set<String> _seenTripIds = {};
  int _newCount = 0;
  Trip? _lastNewTrip;
  double? _lastNewDistanceKm;

  /// La solicitud se cerró mientras la mirabas (el pasajero la canceló, la
  /// tomó otro conductor o venció): se avisa UNA vez y se vuelve a la lista.
  bool _closed = false;
  /// Por qué se cerró, según el último evento del hub o push de este viaje,
  /// y cuándo llegó ese evento.
  _ClosedReason? _closedHint;
  DateTime? _closedHintAt;

  /// Guarda el motivo probable. [weak]: no pisa uno que ya se sabía.
  void _hint(_ClosedReason reason, {bool weak = false}) {
    if (weak && _closedHint != null) return;
    _closedHint = reason;
    _closedHintAt = DateTime.now();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _proposeCtrl = TextEditingController();
    ActiveTripService().active.addListener(_onActiveTrip);
    FcmService.tripEvent.addListener(_onTripPush);
    // Tiempo real (hub): este viaje (si ya oferté o me asignaron) y mis
    // ofertas → misma recarga del polling. Si el join se rechaza (aún no
    // oferté), se reintenta al tener oferta; mientras, sigue el polling.
    final hub = TripsHubService();
    hub.joinTrip(widget.tripId);
    // Grupo de solicitudes: avisa al instante si esta se cancela, la toma
    // otro o vence, aunque se haya abierto sin pasar por la lista.
    hub.joinDriverRequests();
    hub.connected.addListener(_onHubState);
    hub.tripChanged.addListener(_onHubTripChanged);
    hub.proposalsChanged.addListener(_onHubProposalsChanged);
    hub.requestsChanged.addListener(_onHubRequestsChanged);
    _loadRules();
    _load();
  }

  /// Hub (re)conectado: recarga completa. Hub caído: polling corto.
  void _onHubState() {
    if (!mounted) return;
    if (TripsHubService().connected.value) {
      _load();
    } else {
      _scheduleNext();
    }
  }

  void _onHubTripChanged() {
    final e = TripsHubService().tripChanged.value;
    if (!mounted || e == null || e.tripId != widget.tripId) return;
    if (e.reason == 'cancelled' || e.status == TripStatus.cancelled) {
      // "cancelled" llega igual si lo canceló el pasajero o si venció.
      _hint(_expiredByClock ? _ClosedReason.expired : _ClosedReason.cancelled,
          weak: true);
    } else if (e.reason == 'accepted') {
      // Asignado: si no fui yo, lo tomó otro (se verifica al recargar).
      _hint(_ClosedReason.taken, weak: true);
    }
    _load();
  }

  void _onHubProposalsChanged() {
    final e = TripsHubService().proposalsChanged.value;
    if (mounted && e != null && e.tripId == widget.tripId) _load();
  }

  /// La solicitud se tomó, retiró o canceló (grupo de solicitudes, al que
  /// entra la lista): recargar y, si ya no está, avisar el motivo.
  void _onHubRequestsChanged() {
    final e = TripsHubService().requestsChanged.value;
    if (!mounted || e == null || e.tripId != widget.tripId) return;
    switch (e.reason) {
      case 'withdrawn':
        _hint(_ClosedReason.cancelled);
        break;
      case 'taken':
        _hint(_ClosedReason.taken);
        break;
      case 'cancelled': // Bugie la canceló por vencimiento.
        _hint(_ClosedReason.expired);
        break;
    }
    _load();
  }

  /// La solicitud tenía un vencimiento (sin conductor / hora del programado)
  /// y ya llegó.
  bool get _expiredByClock {
    final t = _trip;
    final at = t?.expiresAt;
    if (t == null || at == null || t.expiresReason == 'proposal_confirm') {
      return false;
    }
    return !DateTime.now().isBefore(at.subtract(const Duration(seconds: 5)));
  }

  Future<void> _loadRules() async {
    try {
      final r = await context.read<AdminSettingsService>().getFareRules();
      if (mounted) setState(() => _rules = r);
    } catch (_) {/* sin reglas: valida el backend */}
  }

  /// Push de ESTE viaje: te eligieron → al viaje asignado; cualquier otro
  /// (aceptó tu oferta, deshizo, eligió a otro, venció...) → recargar.
  void _onTripPush() {
    final e = FcmService.tripEvent.value;
    if (!mounted || e == null || e.tripId != widget.tripId) return;
    if (e.type == 'trip_cancelled') {
      final by = e.data['cancelled_by'];
      _hint(by == 'system'
          ? _ClosedReason.expired
          : (by == 'passenger'
              ? _ClosedReason.cancelled
              : _ClosedReason.unknown));
    } else if (e.type == 'offer_not_chosen') {
      _hint(_ClosedReason.taken);
    }
    if (e.type == 'driver_chosen') {
      // Al tocar el aviso ya navega su ruta; con la app abierta, aquí.
      if (!e.opened) {
        final route = (e.data['route'] ?? '').toString();
        context.go(route.contains('scheduled')
            ? '/driver/scheduled'
            : '/driver/trip-in-progress');
      }
      return;
    }
    _load();
  }

  void _onActiveTrip() {
    if (mounted) setState(() {});
  }

  /// Con un viaje activo no se puede aceptar, proponer ni confirmar otra
  /// solicitud: avisa y devuelve true.
  bool _blockedByActiveTrip() {
    final active = ActiveTripService().active.value;
    if (active == null) return false;
    _showSnack(ActiveTripNotice.message(active.isDelivery));
    return true;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ActiveTripService().active.removeListener(_onActiveTrip);
    FcmService.tripEvent.removeListener(_onTripPush);
    final hub = TripsHubService();
    hub.connected.removeListener(_onHubState);
    hub.tripChanged.removeListener(_onHubTripChanged);
    hub.proposalsChanged.removeListener(_onHubProposalsChanged);
    hub.requestsChanged.removeListener(_onHubRequestsChanged);
    hub.leaveTrip(widget.tripId);
    hub.leaveDriverRequests();
    _pollingTimer?.cancel();
    _proposeCtrl.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final wasFg = _isForeground;
    _isForeground = state == AppLifecycleState.resumed;
    if (_isForeground && !wasFg) {
      _load();
    } else if (!_isForeground) {
      _pollingTimer?.cancel();
      _pollingTimer = null;
    }
  }

  Future<void> _load() async {
    if (!_isForeground || _closed) return;
    final repo = context.read<TripsRepository>();
    final startedAt = DateTime.now();
    try {
      // 1) Pending list: para encontrar este trip y detectar nuevos.
      final list = await repo.getPending();
      if (!mounted || _closed) return;

      // Buscamos nuestro trip. Si no está en pending ya no se puede tomar.
      Trip? me;
      for (final t in list) {
        if (t.id == widget.tripId) { me = t; break; }
      }

      // La estaba viendo y ya no está (cancelada, tomada o vencida): avisar
      // el motivo y volver a Solicitudes.
      if (me == null && _trip != null) {
        await _onRequestClosed();
        return;
      }
      // Sigue abierta con datos pedidos DESPUÉS del aviso (era de otra cosa,
      // p. ej. se reabrió): la pista ya no aplica.
      final hintAt = _closedHintAt;
      if (me != null && hintAt != null && hintAt.isBefore(startedAt)) {
        _closedHint = null;
        _closedHintAt = null;
      }

      // Primera carga: snapshot inicial de IDs.
      if (_seenTripIds.isEmpty) {
        _seenTripIds = list.map((t) => t.id).toSet();
      } else {
        // Detectar nuevas (que NO estaban antes y NO son este trip).
        final newOnes = list
            .where((t) => !_seenTripIds.contains(t.id) && t.id != widget.tripId)
            .toList();
        if (newOnes.isNotEmpty) {
          _newCount += newOnes.length;
          _lastNewTrip = newOnes.last;
          // Distancia conductor → origen de la última nueva (si hay GPS).
          final lastPos =
              context.read<LocationTrackingService>().lastKnownPosition;
          if (lastPos != null) {
            _lastNewDistanceKm = haversineKm(
              LatLng(lastPos.latitude, lastPos.longitude),
              LatLng(_lastNewTrip!.originLat, _lastNewTrip!.originLng),
            );
          }
        }
        _seenTripIds = list.map((t) => t.id).toSet();
      }

      // 2) Counter del trip actual + mi oferta vigente (para saber si
      //    acepté su tarifa o si el pasajero aceptó la mía y hasta cuándo).
      DriverCounterInfo? counter;
      Proposal? myOffer;
      if (me != null) {
        try {
          final counters = await repo.getMyCounterProposals([widget.tripId]);
          counter = counters[widget.tripId];
        } catch (_) {}
        try {
          final mine = await repo.getProposals(widget.tripId);
          for (final p in mine) {
            if (p.status == 'pending' ||
                p.status == 'driver_accepted' ||
                p.status == 'accepted_by_passenger') {
              myOffer = p;
              break;
            }
          }
        } catch (_) {}
      }

      // 3) Ruta del trip (solo la primera vez).
      if (_routePoints.isEmpty && me != null) {
        try {
          final info = await repo.getRoute(
            originLat: me.originLat,
            originLng: me.originLng,
            destLat: me.destLat,
            destLng: me.destLng,
          );
          // RouteInfo trae una lista de opciones de ruta. Tomamos la
          // primera (la principal) y de ahí sus coordenadas. Si no hay
          // opciones, queda vacío y el mapa solo muestra los markers.
          if (info.options.isNotEmpty) {
            _routePoints = info.options.first.coordinates;
            _routeKm = info.options.first.distanceKm;
            _routeMin = info.options.first.durationMinutes;
          }
        } catch (_) {}
      }

      if (mounted) {
        setState(() {
          _trip = me ?? _trip;
          _counter = counter;
          _myOffer = myOffer;
          _loading = false;
          _error = me == null ? 'Esta solicitud ya no está disponible.' : null;
        });
        // Con oferta vigente ya tengo acceso al grupo del viaje en el hub.
        if (myOffer != null) TripsHubService().retryJoinTrip(widget.tripId);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    } finally {
      _scheduleNext();
    }
  }

  /// Reprograma el siguiente poll: 5 s si hay negociación viva, 10 s normal;
  /// con el hub conectado los cambios llegan al instante y queda 30 s de
  /// respaldo.
  void _scheduleNext() {
    _pollingTimer?.cancel();
    if (!_isForeground || !mounted || _closed) return;
    final hasActive = _counter?.isMyPending == true ||
        _counter?.isCounterFromPassenger == true ||
        _myOffer != null;
    final seconds =
        TripsHubService().connected.value ? 30 : (hasActive ? 5 : 10);
    _pollingTimer = Timer(Duration(seconds: seconds), _load);
  }

  // ── ACCIONES (mismo orden y nombres que IncomingRequestsScreen) ──
  // Todas pasan por _run: una sola acción a la vez (anti doble toque) y,
  // con error, el mensaje del backend tal cual y se recarga la solicitud.

  /// Ejecuta una acción de negociación. Devuelve true si salió bien.
  Future<bool> _run(String kind, Future<void> Function() action,
      {double? sendingFare}) async {
    if (_isActing || _closed) return false;
    setState(() {
      _isActing = true;
      _actingKind = kind;
      _sendingFare = sendingFare;
    });
    try {
      await action();
      return true;
    } on ApiException catch (e) {
      _showSnack(e.message);
      await _handleConflict(e);
      return false;
    } catch (_) {
      _showSnack('No se pudo completar la acción. Intenta de nuevo.');
      return false;
    } finally {
      if (mounted) {
        setState(() {
          _isActing = false;
          _actingKind = null;
          _sendingFare = null;
        });
      }
    }
  }

  /// 409 del backend: un pasajero ya aceptó mi oferta en OTRO viaje
  /// (waitingTripId) → ir a esa solicitud a confirmarla; en los demás casos
  /// (ej. proposalId: el pasajero ya aceptó mi oferta aquí) se recarga y la
  /// pantalla muestra "Confirmar viaje".
  Future<void> _handleConflict(ApiException e) async {
    if (!mounted) return;
    final waitingTripId = e.field('waitingTripId');
    if (e.status == 409 &&
        waitingTripId != null &&
        waitingTripId != widget.tripId) {
      context.pushReplacement('/driver/incoming/$waitingTripId');
      return;
    }
    await _load();
  }

  /// La solicitud desapareció de las pendientes mientras la veías. Si me la
  /// asignaron a mí, voy al viaje; si no, aviso el motivo con un diálogo y
  /// vuelvo a Solicitudes (que se recarga al volver).
  Future<void> _onRequestClosed() async {
    if (_closed || !mounted) return;
    _closed = true;
    _pollingTimer?.cancel();
    final repo = context.read<TripsRepository>();
    final myId = context.read<Session>().user?.userId;
    try {
      // Solo responde si soy parte del viaje (p. ej. el conductor asignado).
      final t = await repo.getById(widget.tripId);
      if (!mounted) return;
      final mine = myId != null &&
          t.driverId == myId &&
          (t.status == TripStatus.accepted ||
              t.status == TripStatus.inProgress ||
              t.status == TripStatus.sosActive);
      if (mine) {
        _goToAssigned(t);
        return;
      }
    } catch (_) {/* sin acceso: el viaje no es mío */}
    if (!mounted) return;

    final reason = _closedHint ??
        (_expiredByClock ? _ClosedReason.expired : _ClosedReason.unknown);
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        icon: Icon(reason.icon, color: reason.color, size: 36),
        title: Text(reason.message, textAlign: TextAlign.center),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/driver/requests');
    }
  }

  /// Viaje asignado: al viaje en curso o, si es un programado que todavía
  /// no empieza, a la agenda de programados.
  void _goToAssigned(Trip assigned) {
    if (!mounted) return;
    context.go(assigned.isFutureScheduled
        ? '/driver/scheduled'
        : '/driver/trip-in-progress');
  }

  /// "Aceptar S/ X": acepta la tarifa del pasajero (driver-accept). No
  /// asigna: queda esperando que el pasajero me elija.
  Future<void> _accept() async {
    final t = _trip;
    if (t == null || _isActing || _blockedByActiveTrip()) return;
    final ok = await _run('accept',
        () => context.read<TripsRepository>().driverAccept(t.id));
    if (!ok || !mounted) return;
    _showSnack('Aceptaste la tarifa. Espera que el pasajero te elija.');
    await _load();
  }

  /// "Aceptar S/ Y": acepta la contraoferta del pasajero (accept-counter).
  /// El viaje queda asignado directo.
  Future<void> _acceptCounter() async {
    final t = _trip;
    final c = _counter;
    if (t == null || c == null || _isActing || _blockedByActiveTrip()) return;
    Trip? assigned;
    final ok = await _run('counter', () async {
      assigned = await context.read<TripsRepository>().acceptCounter(t.id, c.id);
    });
    if (ok && assigned != null) _goToAssigned(assigned!);
  }

  /// "Retirar oferta" (decline-by-driver): cierra mis ofertas en este viaje.
  Future<void> _decline() async {
    final t = _trip;
    if (t == null || _isActing) return;
    final ok = await _run('decline',
        () => context.read<TripsRepository>().declineByDriver(t.id));
    if (ok && mounted && context.canPop()) context.pop();
  }

  /// "Confirmar viaje": confirma la oferta que el pasajero aceptó.
  Future<void> _confirmAcceptance() async {
    final t = _trip;
    final proposalId = _myOffer?.isWaitingDriverConfirmation == true
        ? _myOffer!.id
        : (_counter?.isWaitingMyConfirmation == true ? _counter!.id : null);
    if (t == null || proposalId == null || _isActing || _blockedByActiveTrip()) {
      return;
    }
    Trip? assigned;
    final ok = await _run('confirm', () async {
      assigned = await context
          .read<TripsRepository>()
          .confirmAcceptance(t.id, proposalId);
    });
    if (ok && assigned != null) _goToAssigned(assigned!);
  }

  /// Valida el monto con el rango (mismo texto que el backend). Muestra el
  /// error y devuelve false si no es válido.
  bool _validFare(double? fare) {
    final t = _trip;
    if (t == null) return false;
    if (fare == null) {
      _showSnack(FareRules.invalidAmount);
      return false;
    }
    final err = _rules.rangeError(fare, t.fareForRange);
    if (err != null) {
      _showSnack(err);
      return false;
    }
    return true;
  }

  Future<void> _submitProposal() async {
    if (_isActing || _blockedByActiveTrip()) return;
    final fare = FareRules.parse(_proposeCtrl.text);
    if (!_validFare(fare)) return;
    await _sendProposal(fare!);
  }

  /// Chip de contraoferta rápida: confirmación breve y envía con la misma
  /// llamada que "Otro monto".
  Future<void> _quickPropose(double fare) async {
    if (_isActing || _blockedByActiveTrip() || !_validFare(fare)) return;
    final ok = await confirmQuickFare(context,
        fare: fare, recipient: 'el pasajero');
    if (!ok || !mounted) return;
    await _sendProposal(fare);
  }

  /// "Proponer otro monto" (propose).
  Future<void> _sendProposal(double fare) async {
    final t = _trip;
    if (t == null || _blockedByActiveTrip()) return;
    final ok = await _run('propose',
        () => context.read<TripsRepository>().proposeFare(t.id, fare),
        sendingFare: fare);
    if (!mounted) return;
    if (ok) setState(() => _isProposing = false);
    await _load();
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  static String _payLabel(String m) {
    switch (m) {
      case 'cash': return 'Efectivo';
      case 'yape': return 'Yape';
      case 'plin': return 'Plin';
      default:     return m.toUpperCase();
    }
  }

  static IconData _payIcon(String m) =>
      m == 'cash' ? Icons.payments_outlined : Icons.qr_code_2_rounded;

  static String _timeAgo(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'ahora';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    return 'hace ${diff.inHours} h';
  }

  /// "a X min" hasta el pasajero: distancia en línea recta a ~22 km/h
  /// (la misma estimación que usa la pantalla de viaje en curso).
  static String _etaText(double km) {
    final min = (km / 22.0 * 60.0).round();
    return min < 1 ? 'a menos de 1 min' : 'a $min min';
  }

  void _openHistory() {
    // Abre el mismo modal de historial que la lista.
    final myUserId = context.read<Session>().user?.userId;
    if (myUserId == null) return;
    showDialog(
      context: context,
      builder: (_) => DriverHistoryDialog(
        tripId: widget.tripId,
        myUserId: myUserId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final t = _trip;
    if (t == null) {
      // Si la solicitud ya no está (la tomó otro, expiró, etc).
      return Scaffold(
        appBar: AppBar(title: const Text('Solicitud no disponible')),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  NegotiationStatusBanner(
                    state: NegotiationState.expired,
                    title: _error ?? 'Esta solicitud ya no está disponible.',
                    message:
                        'Puede que otro conductor la haya tomado o que el pasajero la cancelara.',
                  ),
                  const SizedBox(height: 16),
                  PrimaryActionButton(
                    label: 'Volver a la lista',
                    icon: Icons.arrow_back,
                    color: BugieColors.primary,
                    onPressed: () => context.pop(),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    // Posición del conductor (puede ser null si todavía no llegó GPS).
    final lastPos = context.watch<LocationTrackingService>().lastKnownPosition;
    final driverPos = lastPos == null
        ? null
        : LatLng(lastPos.latitude, lastPos.longitude);

    final sortedWp = [...t.waypoints]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    // Markers para el mapa de fondo.
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
      if (driverPos != null)
        BugieMarker(position: driverPos, kind: MarkerKind.driver),
    ];

    final screenH = MediaQuery.of(context).size.height;

    return Scaffold(
      // Barra fija abajo con la acción principal: siempre visible, sin
      // tener que deslizar la hoja (y sin quedar bajo la barra del sistema).
      bottomNavigationBar: _bottomBar(t),
      body: Stack(
        children: [
          // ── MAPA FULLSCREEN ─────────────────────────────────────────
          Positioned.fill(
            child: BugieMap(
              height: screenH,
              markers: markers,
              route: _routePoints,
              center: LatLng(t.originLat, t.originLng),
              fitBoundsOnMarkers: true,
              fitOnReady: true,
              // La hoja inferior tapa la mitad de abajo: encuadramos la
              // ruta en la zona visible de arriba.
              fitPadding: EdgeInsets.fromLTRB(48, 96, 72, screenH * 0.52),
              // Sus botones de zoom/foco quedan tapados por el sheet,
              // así que los empujamos hacia arriba.
              controlsBottomOffset: screenH * 0.50,
            ),
          ),

          // ── BOTÓN VOLVER + BANNER NUEVA SOLICITUD ───────────────────
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _CircleIconBtn(
                    icon: Icons.arrow_back,
                    onTap: () => context.pop(),
                  ),
                  if (_newCount > 0) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: NewRequestBanner(
                        count: _newCount,
                        lastFare: _lastNewTrip?.estimatedFare,
                        lastDistanceKm: _lastNewDistanceKm,
                        onTap: () => context.pop(),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // ── HOJA INFERIOR con precio, datos y acciones ──────────────
          DraggableScrollableSheet(
            initialChildSize: 0.5,
            minChildSize: 0.22,
            maxChildSize: 0.94,
            snap: true,
            snapSizes: const [0.22, 0.5, 0.94],
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(24),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.15),
                      blurRadius: 20,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: ListView(
                  controller: scrollController,
                  padding: EdgeInsets.fromLTRB(
                      20, 0, 20, 24 + MediaQuery.of(context).viewInsets.bottom),
                  children: [
                    // Handle visual
                    Center(
                      child: Container(
                        margin: const EdgeInsets.only(top: 10, bottom: 14),
                        width: 44,
                        height: 5,
                        decoration: BoxDecoration(
                          color: BugieColors.textMuted.withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    ..._sheetChildren(t, sortedWp, driverPos),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  // ── Estado de la negociación (según mi oferta vigente) ──

  /// El pasajero aceptó mi oferta: debo confirmar antes del plazo.
  bool get _waitingMyConfirm =>
      _myOffer?.isWaitingDriverConfirmation == true ||
      _counter?.isWaitingMyConfirmation == true;

  /// Acepté la tarifa del pasajero y espero que me elija.
  bool get _iAcceptedFare =>
      !_waitingMyConfirm && _myOffer?.status == 'driver_accepted';

  /// El pasajero me envió una contraoferta.
  bool get _passengerCounter =>
      !_waitingMyConfirm && _counter?.isCounterFromPassenger == true;

  /// Tengo una oferta vigente (puedo retirarla).
  bool get _hasOffer =>
      _waitingMyConfirm ||
      _iAcceptedFare ||
      _passengerCounter ||
      _counter?.isMyPending == true ||
      _myOffer != null;

  /// Hasta cuándo puedo confirmar la oferta que el pasajero aceptó.
  DateTime? get _confirmExpiresAt {
    final fromOffer = _myOffer?.isWaitingDriverConfirmation == true
        ? _myOffer!.confirmExpiresAt
        : null;
    if (fromOffer != null) return fromOffer;
    final t = _trip;
    return t?.expiresReason == 'proposal_confirm' ? t?.expiresAt : null;
  }

  /// Monto de la oferta que el pasajero aceptó.
  double? get _acceptedFare => _myOffer?.isWaitingDriverConfirmation == true
      ? _myOffer!.fare
      : (_counter?.isWaitingMyConfirmation == true ? _counter!.fare : null);

  /// Contenido de la hoja inferior.
  List<Widget> _sheetChildren(
      Trip t, List<Waypoint> sortedWp, LatLng? driverPos) {
    final c = _counter;
    final bc = context.bugie;
    final passengerCounter = _passengerCounter;
    final waitingMyConfirm = _waitingMyConfirm;
    // Lo que ofrece el pasajero (o su contrapropuesta, si respondió).
    // passengerOfferFare = oferta vigente del pasajero (/pending).
    final offer = t.passengerOfferFare ?? t.estimatedFare;
    final headline = passengerCounter ? c!.fare : offer;
    // Rango permitido para proponer.
    final range = _rules.range(t.fareForRange);
    // Chips rápidos: precio ofrecido +1, +2, +3 (solo los que caen en el rango).
    final fares = quickFares(base: headline, deltas: const [1, 2, 3])
        .where((f) => f >= range.min && f <= range.max)
        .toList();
    final pickupKm = driverPos == null
        ? null
        : haversineKm(driverPos, LatLng(t.originLat, t.originLng));
    final busy = _isActing;
    final activeTrip = ActiveTripService().active.value;

    return [
      // Con un viaje activo no puede aceptar ni proponer (solo ver).
      if (activeTrip != null) ...[
        ActiveTripNotice(isDelivery: activeTrip.isDelivery),
        const SizedBox(height: 12),
      ],
      // ── Cabecera: tipo de servicio + tiempo + historial ──
      Row(
        children: [
          ServiceBadge(isDelivery: t.isDelivery, compact: true),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _timeAgo(t.createdAt),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: bc.textMuted),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            tooltip: 'Mi historial de propuestas',
            icon: Icon(Icons.history, color: bc.textMuted),
            onPressed: _isActing ? null : _openHistory,
          ),
        ],
      ),
      if (t.scheduledAt != null) ...[
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerLeft,
          child: ScheduledBadge(at: t.scheduledAt!),
        ),
      ],
      // Vencimiento: se cancela por falta de conductor / hora del
      // programado. (El plazo para confirmar va en el aviso de abajo.)
      if (t.expiresAt != null && t.expiresReason != 'proposal_confirm') ...[
        const SizedBox(height: 6),
        Align(
          alignment: Alignment.centerLeft,
          child: ExpiryCountdown(
              expiresAt: t.expiresAt!,
              reason: t.expiresReason,
              onExpired: _load),
        ),
      ],
      const SizedBox(height: 8),

      // ── Pasajero + PRECIO grande ──
      Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          PassengerAvatar(
              photoUrl: t.passengerPhotoUrl, name: t.passengerName, size: 48),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        shortPassengerName(t.passengerName,
                            shortName: t.passengerShortName),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13, color: bc.textMuted),
                      ),
                    ),
                    // Calificación del pasajero (hoy siempre null: no se pinta).
                    if (t.passengerRating != null) ...[
                      const SizedBox(width: 6),
                      PassengerRatingChip(
                          rating: t.passengerRating,
                          count: t.passengerRatingCount),
                    ],
                  ],
                ),
                PriceTag(
                  amount: headline,
                  label: passengerCounter ? 'Te propone' : 'Ofrece',
                  fontSize: 34,
                  highlight: passengerCounter,
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),

      // ── Chips de datos ──
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          if (_routeKm != null)
            InfoChip(
              icon: Icons.route_outlined,
              text: _routeMin != null
                  ? '${_routeKm!.toStringAsFixed(1)} km · ${_routeMin!.round()} min'
                  : '${_routeKm!.toStringAsFixed(1)} km',
            ),
          if (pickupKm != null)
            InfoChip(
              icon: Icons.near_me_outlined,
              text: _etaText(pickupKm),
              color: BugieColors.primary,
            ),
          InfoChip(
              icon: _payIcon(t.paymentMethod), text: _payLabel(t.paymentMethod)),
          if (sortedWp.isNotEmpty)
            InfoChip(
              icon: Icons.more_vert,
              text: sortedWp.length == 1
                  ? '1 parada'
                  : '${sortedWp.length} paradas',
              color: BugieColors.mapWaypoint,
            ),
          if (t.isDelivery)
            const InfoChip(
              icon: Icons.inventory_2_outlined,
              text: 'Envío',
              color: BugieColors.accent,
            ),
          if (t.isDelivery && t.packageIsFragile)
            const InfoChip(
              icon: Icons.warning_amber_rounded,
              text: 'Frágil',
              color: BugieColors.danger,
            ),
        ],
      ),
      const SizedBox(height: 14),

      // ── Envío: paquete + fotos en miniatura ──
      if (t.isDelivery) ...[
        _PackageSummary(trip: t),
        const SizedBox(height: 8),
        TripPhotosGallery(
          tripId: t.id,
          title: 'Fotos del paquete',
          kinds: const {TripPhotoKind.package},
          emptyText: 'El cliente no adjuntó fotos del paquete.',
        ),
        const SizedBox(height: 14),
      ],

      // ── Origen / paradas / destino ──
      _RouteStops(trip: t, waypoints: sortedWp),
      const SizedBox(height: 16),

      // ── Estado de la negociación (animado) ──
      AnimatedSize(
        duration: motionDuration(context, 250),
        curve: Curves.easeOut,
        alignment: Alignment.topCenter,
        child: _statusBanner(c),
      ),

      // ── Contraoferta (la acción principal va en la barra fija de abajo) ──
      AnimatedSwitcher(
        duration: motionDuration(context, 280),
        transitionBuilder: (child, anim) => FadeTransition(
          opacity: anim,
          child: SizeTransition(
              sizeFactor: anim, axisAlignment: -1, child: child),
        ),
        child: waitingMyConfirm
            ? const SizedBox(key: ValueKey('none'), width: double.infinity)
            : Column(
                key: const ValueKey('actions'),
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Proponer otro monto',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: bc.text),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Toca un monto para enviárselo al pasajero. '
                    '${_rules.rangeHint(t.fareForRange)}.',
                    style: TextStyle(fontSize: 12.5, color: bc.textMuted),
                  ),
                  const SizedBox(height: 10),
                  FareChips(
                    fares: fares,
                    referenceFare: headline,
                    enabled: !busy && activeTrip == null,
                    onSelected: _quickPropose,
                    onOther: () {
                      if (_isActing || _blockedByActiveTrip()) return;
                      setState(() {
                      _isProposing = !_isProposing;
                      if (_isProposing && _proposeCtrl.text.isEmpty) {
                        _proposeCtrl.text = t.estimatedFare.toStringAsFixed(2);
                      }
                      });
                    },
                  ),
                  AnimatedSize(
                    duration: motionDuration(context, 220),
                    alignment: Alignment.topCenter,
                    child: _isProposing
                        ? Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: _EnsureVisible(
                              child: FareInputPanel(
                                controller: _proposeCtrl,
                                title: 'Proponer otro monto al pasajero',
                                hint: t.estimatedFare.toStringAsFixed(2),
                                helper: _rules.rangeHint(t.fareForRange),
                                loading:
                                    _isActing && _actingKind == 'propose',
                                onSubmit: _submitProposal,
                                onCancel: () {
                                  if (_isActing) return;
                                  setState(() => _isProposing = false);
                                },
                              ),
                            ),
                          )
                        : const SizedBox(width: double.infinity),
                  ),
                ],
              ),
      ),
    ];
  }

  /// Barra fija inferior: la acción principal según el estado y
  /// "Rechazar" / "Retirar oferta" como secundaria a su lado.
  ///  - Sin oferta:          Rechazar | Aceptar S/ X (driver-accept).
  ///  - Mi oferta pendiente: Retirar oferta | Aceptar S/ X (tarifa del pasajero).
  ///  - Contraoferta S/ Y:   Retirar oferta | Aceptar S/ Y (accept-counter).
  ///  - Acepté su tarifa:    Retirar oferta.
  ///  - El pasajero aceptó:  Retirar oferta | Confirmar viaje.
  /// Mientras se escribe "Otro monto" se oculta: ahí la acción principal es
  /// "Enviar oferta" del propio panel.
  Widget? _bottomBar(Trip t) {
    final c = _counter;
    final bc = context.bugie;
    final passengerCounter = _passengerCounter;
    final waitingMyConfirm = _waitingMyConfirm;
    // "Aceptar" acepta la oferta vigente del pasajero.
    final offer = t.passengerOfferFare ?? t.estimatedFare;
    final busy = _isActing;
    // Viaje activo: aceptar / confirmar quedan deshabilitados.
    final blocked = ActiveTripService().hasActive;
    if (_isProposing && !waitingMyConfirm) return null;

    final secondary = _RejectButton(
      label: _hasOffer ? 'Retirar oferta' : 'Rechazar',
      loading: busy && _actingKind == 'decline',
      onPressed: busy ? null : _decline,
    );

    final String kind;
    final Widget? primary;
    if (waitingMyConfirm) {
      kind = 'confirm';
      primary = PrimaryActionButton(
        label: t.isDelivery ? 'Confirmar envío' : 'Confirmar viaje',
        icon: Icons.play_arrow_rounded,
        loading: busy && _actingKind == 'confirm',
        onPressed: busy || blocked ? null : _confirmAcceptance,
      );
    } else if (passengerCounter) {
      kind = 'counter';
      primary = PrimaryActionButton(
        label: 'Aceptar ${formatSoles(c!.fare)}',
        icon: Icons.check_rounded,
        loading: busy && _actingKind == 'counter',
        onPressed: busy || blocked ? null : _acceptCounter,
      );
    } else if (_iAcceptedFare) {
      kind = 'withdraw';
      primary = null;
    } else {
      kind = 'accept';
      primary = PrimaryActionButton(
        label: 'Aceptar ${formatSoles(offer)}',
        icon: Icons.check_rounded,
        loading: busy && _actingKind == 'accept',
        onPressed: busy || blocked ? null : _accept,
      );
    }

    final Widget content = primary == null
        ? SizedBox(
            key: ValueKey(kind), width: double.infinity, child: secondary)
        : Row(
            key: ValueKey(kind),
            children: [
              Expanded(flex: 1, child: secondary),
              const SizedBox(width: 10),
              Expanded(flex: 2, child: primary),
            ],
          );

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: bc.border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: AnimatedSwitcher(
            duration: motionDuration(context, 250),
            child: content,
          ),
        ),
      ),
    );
  }

  /// Aviso del estado de la negociación según mi oferta vigente.
  Widget _statusBanner(DriverCounterInfo? c) {
    Widget wrap(Widget w) =>
        Padding(padding: const EdgeInsets.only(bottom: 14), child: w);
    final t = _trip;

    if (_sendingFare != null) {
      return wrap(NegotiationStatusBanner(
        state: NegotiationState.sending,
        title: 'Enviando tu oferta de ${formatSoles(_sendingFare!)}…',
      ));
    }
    if (_waitingMyConfirm) {
      final until = _confirmExpiresAt;
      return wrap(Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          NegotiationStatusBanner(
            state: NegotiationState.accepted,
            title: '¡El pasajero aceptó ${formatSoles(_acceptedFare ?? 0)}!',
            message: 'Al confirmar, tus demás solicitudes pendientes se '
                'rechazarán automáticamente.',
          ),
          if (until != null) ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: ExpiryCountdown(
                expiresAt: until,
                reason: 'proposal_confirm',
                textBuilder: (clock) => 'Confirma antes de $clock',
                onExpired: _load,
              ),
            ),
          ],
        ],
      ));
    }
    if (_iAcceptedFare) {
      return wrap(const NegotiationStatusBanner(
        state: NegotiationState.waiting,
        title: 'Aceptaste la tarifa; esperando que el pasajero te elija',
        message: 'Si quieres, propón otro monto o retira tu oferta.',
      ));
    }
    if (c == null) return const SizedBox(width: double.infinity);
    if (c.isCounterFromPassenger) {
      return wrap(NegotiationStatusBanner(
        state: NegotiationState.counter,
        title: 'El pasajero te ofrece ${formatSoles(c.fare)}',
        message: 'Acéptalo, propón otro monto o retira tu oferta.',
      ));
    }
    if (c.isMyPending) {
      final theirs = t == null
          ? ''
          : ' de ${formatSoles(t.passengerOfferFare ?? t.estimatedFare)}';
      return wrap(NegotiationStatusBanner(
        state: NegotiationState.waiting,
        title: 'Esperando al pasajero',
        message: 'Tu oferta: ${formatSoles(c.fare)}. Puedes proponer otro '
            'monto o aceptar su tarifa$theirs.',
      ));
    }
    if (c.isRejected && !_hiddenRejects.contains(c.id)) {
      return wrap(NegotiationStatusBanner(
        state: NegotiationState.rejected,
        title: 'El pasajero rechazó tu oferta de ${formatSoles(c.fare)}',
        message: 'Puedes enviar otra o esperar.',
        trailing: IconButton(
          visualDensity: VisualDensity.compact,
          tooltip: 'Ocultar aviso',
          icon: const Icon(Icons.close, size: 18),
          onPressed: () => setState(() => _hiddenRejects.add(c.id)),
        ),
      ));
    }
    return const SizedBox(width: double.infinity);
  }
}

/// Motivo por el que se cerró la solicitud que el conductor estaba viendo.
enum _ClosedReason {
  cancelled('El pasajero canceló esta solicitud.', Icons.cancel_outlined,
      BugieColors.danger),
  taken('Otro conductor tomó este viaje.', Icons.person_off_outlined,
      BugieColors.warning),
  expired('Esta solicitud venció.', Icons.timer_off_outlined,
      BugieColors.warning),
  unknown('Esta solicitud ya no está disponible.', Icons.info_outline,
      BugieColors.textMuted);

  final String message;
  final IconData icon;
  final Color color;
  const _ClosedReason(this.message, this.icon, this.color);
}

/// Origen, paradas y destino con íconos y una línea que los une.
class _RouteStops extends StatelessWidget {
  final Trip trip;
  final List<Waypoint> waypoints;
  const _RouteStops({required this.trip, required this.waypoints});

  @override
  Widget build(BuildContext context) {
    final rows = <(IconData, Color, String, String)>[
      (Icons.trip_origin, BugieColors.mapOrigin, 'Recojo', trip.originAddress),
      for (var i = 0; i < waypoints.length; i++)
        (Icons.radio_button_checked, BugieColors.mapWaypoint, 'Parada ${i + 1}',
            waypoints[i].address),
      (Icons.location_on, BugieColors.mapDestination, 'Destino',
          trip.destAddress),
    ];
    final c = context.bugie;
    return Column(
      children: [
        for (var i = 0; i < rows.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 24,
                  child: Column(
                    children: [
                      Icon(rows[i].$1, size: 20, color: rows[i].$2),
                      if (i < rows.length - 1)
                        Expanded(
                          child: Container(
                            width: 2,
                            margin: const EdgeInsets.symmetric(vertical: 2),
                            color: c.border,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(
                        bottom: i < rows.length - 1 ? 12 : 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(rows[i].$3,
                            style:
                                TextStyle(fontSize: 11.5, color: c.textMuted)),
                        Text(rows[i].$4,
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: c.text)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Datos del paquete (solo envíos): descripción, peso y detalles.
class _PackageSummary extends StatelessWidget {
  final Trip trip;
  const _PackageSummary({required this.trip});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final desc = (trip.packageDescription ?? '').trim();
    final details = (trip.packageDetails ?? '').trim();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BugieColors.accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BugieColors.accent.withValues(alpha: 0.30)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.inventory_2_outlined,
                  size: 18, color: BugieColors.accent),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  desc.isEmpty ? 'Paquete' : desc,
                  style: TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 14, color: c.text),
                ),
              ),
              if (trip.packageWeightKg != null)
                Text('${trip.packageWeightKg} kg',
                    style: TextStyle(fontSize: 12.5, color: c.textMuted)),
            ],
          ),
          if (details.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(details, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
          ],
        ],
      ),
    );
  }
}

/// Botón circular flotante (volver) sobre el mapa.
class _CircleIconBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _CircleIconBtn({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 44, height: 44,
          decoration: BoxDecoration(
            color: const Color(0xCC0D1117),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
          ),
          child: Icon(icon, size: 20, color: Colors.white),
        ),
      ),
    );
  }
}

/// "Rechazar" con borde rojo, mismo alto que el botón principal.
class _RejectButton extends StatelessWidget {
  final String label;
  final bool loading;
  final VoidCallback? onPressed;
  const _RejectButton(
      {this.label = 'Rechazar', required this.loading, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: BugieColors.danger,
        minimumSize: const Size(0, 54),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        side: BorderSide(
          color: BugieColors.danger
              .withValues(alpha: onPressed == null ? 0.3 : 0.7),
          width: 1.4,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      onPressed: onPressed,
      child: loading
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                  strokeWidth: 2.4, color: BugieColors.danger),
            )
          : FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(label,
                  maxLines: 1,
                  style:
                      const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ),
    );
  }
}

/// Al aparecer (p. ej. el panel "Otro monto" con el teclado) desliza la
/// hoja para que quede completo a la vista.
class _EnsureVisible extends StatefulWidget {
  final Widget child;
  const _EnsureVisible({required this.child});

  @override
  State<_EnsureVisible> createState() => _EnsureVisibleState();
}

class _EnsureVisibleState extends State<_EnsureVisible> {
  @override
  void initState() {
    super.initState();
    // Espera a que suba el teclado antes de desplazar (y repite por si el
    // teclado tardó más en terminar de subir).
    for (final ms in const [400, 900]) {
      Future.delayed(Duration(milliseconds: ms), _reveal);
    }
  }

  void _reveal() {
    if (!mounted) return;
    Scrollable.ensureVisible(
      context,
      alignment: 1,
      duration: motionDuration(context, 250),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
