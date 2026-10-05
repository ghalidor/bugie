import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/services/notification_prefs.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../passenger/presentation/home_shared.dart';
import '../../payments/data/payments_repository.dart';
import '../../trips/data/trips_repository.dart';
import '../../trips/domain/trip_model.dart';
import '../data/driver_demand.dart';
import '../data/driver_repository.dart';
import '../domain/driver_model.dart';
import 'driver_idle_tracking.dart';
import 'widgets/account_blocked_card.dart';
import 'widgets/driver_demand_map.dart';

/// INICIO del conductor.
///
///  1. Saludo + estado animado (En línea / Desconectado) y botón grande
///     Conectarme / Desconectarme: abre la pantalla de conexión de siempre
///     (/driver/go-online), donde el conductor sigue el mismo flujo.
///  2. Si tiene un viaje en curso: tarjeta "Viaje en curso → Continuar".
///  3. Resumen de ganancias tal como lo entrega /payments/earnings
///     (este mes y total con su cantidad de viajes).
///  4. Mapa de demanda (zonas con más pedidos y solicitudes cercanas).
///  5. SOS siempre a mano.
///
/// Los datos se refrescan solo mientras la pantalla se ve (TickerMode: el
/// shell lo apaga en las otras pestañas y el Navigator al abrir otra ruta).
class DriverHomeScreen extends StatefulWidget {
  /// Ir a la pestaña Pedidos del shell (si no se pasa, abre la ruta).
  final VoidCallback? onOpenRequests;

  /// Ir a la pestaña Ganancias del shell (si no se pasa, abre la ruta).
  final VoidCallback? onOpenEarnings;

  const DriverHomeScreen({super.key, this.onOpenRequests, this.onOpenEarnings});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen>
    with WidgetsBindingObserver {
  Driver? _driver;
  Trip? _activeTrip;

  // Resumen
  bool _summaryLoaded = false;
  int? _totalTrips;
  double? _totalEarned;
  double? _monthEarned;

  // Mapa
  LatLng? _mapCenter;
  LatLng? _pos;
  DriverDemand? _demand;
  bool _demandLoading = false;
  String? _demandProblem;

  Timer? _timer;
  bool _tickerOn = true;
  bool _foreground = true;
  bool _initialized = false;

  bool get _visible => _tickerOn && _foreground;

  bool get _online =>
      NotificationPrefs.driverOnline.value ?? _driver?.isOnline ?? false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    FcmService.driverAccount.addListener(_loadDriver);
    NotificationPrefs.driverOnline.addListener(_onOnlineChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final t = TickerMode.valuesOf(context).enabled;
    if (!_initialized || t != _tickerOn) {
      _initialized = true;
      _tickerOn = t;
      _onVisibilityChanged();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    FcmService.driverAccount.removeListener(_loadDriver);
    NotificationPrefs.driverOnline.removeListener(_onOnlineChanged);
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final was = _foreground;
    _foreground = state == AppLifecycleState.resumed;
    if (was != _foreground) _onVisibilityChanged();
  }

  void _onOnlineChanged() {
    if (!mounted) return;
    setState(() {});
    if (_visible) _loadDemand();
  }

  void _onVisibilityChanged() {
    _timer?.cancel();
    _timer = null;
    if (!_visible) return;
    // Al volver a verse: todo fresco (después del frame actual, porque esto
    // puede venir de didChangeDependencies). Luego, cada ~30 s, mapa y
    // viaje activo.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _visible) _refreshAll();
    });
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!_visible) return;
      _loadDemand();
      _loadActiveTrip();
    });
  }

  Future<void> _refreshAll() async {
    await Future.wait([
      _loadDriver(),
      _loadActiveTrip(),
      _loadSummary(),
      _loadDemand(),
    ]);
  }

  Future<void> _loadDriver() async {
    try {
      final d = await context.read<DriverRepository>().getMyProfile();
      if (!mounted) return;
      setState(() => _driver = d);
      // En línea: asegura el envío de su posición (si no estaba corriendo).
      if (d != null && d.isOnline) ensureDriverIdleTracking(context);
    } catch (_) {
      // Sin red: se mantiene lo último.
    }
  }

  Future<void> _loadActiveTrip() async {
    try {
      final t = await context.read<TripsRepository>().getActive();
      final isMineInProgress = t != null &&
          t.driverId != null &&
          (t.status == TripStatus.inProgress ||
              t.status == TripStatus.sosActive ||
              (t.status == TripStatus.accepted && !t.isFutureScheduled));
      if (mounted) setState(() => _activeTrip = isMineInProgress ? t : null);
    } catch (_) {}
  }

  /// Resumen tal cual lo entrega /payments/earnings (sin cálculos propios):
  /// "Este mes" y "Total" con su cantidad de viajes. Sin dato, "—".
  Future<void> _loadSummary() async {
    final repo = context.read<PaymentsRepository>();
    double? month;
    double? total;
    int? trips;
    try {
      final e = await repo.getEarnings();
      month = e.earningsThisMonth;
      total = e.totalEarnings;
      trips = e.totalTrips;
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _monthEarned = month ?? _monthEarned;
      _totalEarned = total ?? _totalEarned;
      _totalTrips = trips ?? _totalTrips;
      _summaryLoaded = true;
    });
  }

  Future<LatLng?> _currentPosition() async {
    // 1) La última que se mandó al backend estando en línea.
    final sent = context.read<LocationTrackingService>().lastKnownPosition;
    if (sent != null) return LatLng(sent.latitude, sent.longitude);
    // 2) GPS del celular (con permiso).
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        return null;
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          timeLimit: Duration(seconds: 10),
        ),
      );
      return LatLng(p.latitude, p.longitude);
    } catch (_) {
      try {
        final p = await Geolocator.getLastKnownPosition();
        if (p != null) return LatLng(p.latitude, p.longitude);
      } catch (_) {}
      return null;
    }
  }

  Future<void> _loadDemand() async {
    if (_demandLoading) return;
    setState(() => _demandLoading = true);
    final api = DriverDemandApi(context.read<ApiClient>());
    final pos = await _currentPosition();
    if (!mounted) return;
    if (pos == null) {
      setState(() {
        _demandLoading = false;
        _demandProblem = 'Activa tu ubicación para ver solicitudes cerca';
      });
      return;
    }
    try {
      final d = await api.get(lat: pos.latitude, lng: pos.longitude);
      if (!mounted) return;
      setState(() {
        _pos = pos;
        _mapCenter ??= pos;
        _demand = d;
        _demandProblem = null;
        _demandLoading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _pos = pos;
        _mapCenter ??= pos;
        _demandLoading = false;
        // Sin red mantenemos lo último visible; otro error se avisa.
        _demandProblem = e.isNetwork
            ? (_demand == null ? 'Sin conexión: no se pudo ver la demanda' : null)
            : 'No se pudo cargar la demanda';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _pos = pos;
        _mapCenter ??= pos;
        _demandLoading = false;
        _demandProblem = _demand == null ? 'No se pudo cargar la demanda' : null;
      });
    }
  }

  // ── Acciones ────────────────────────────────────────────────────────────

  Future<void> _toggleOnline() async {
    final d = _driver;
    if (!_online && d != null && d.status == DriverStatus.pendingDocs) {
      // Botón "Ver mis documentos".
      await context.push('/driver/documents');
      if (mounted) _refreshAll();
      return;
    }
    // Conectarme / Desconectarme: abre la pantalla de conexión existente y
    // el conductor sigue allí el mismo flujo de siempre.
    await context.push('/driver/go-online');
    if (mounted) _refreshAll();
  }

  void _openRequest(NearbyRequest r) {
    context.push('/driver/incoming/${r.id}').then((_) {
      if (mounted && _visible) _loadDemand();
    });
  }

  void _openRequests() {
    if (widget.onOpenRequests != null) {
      widget.onOpenRequests!();
    } else {
      context.push('/driver/requests');
    }
  }

  void _openEarnings() {
    if (widget.onOpenEarnings != null) {
      widget.onOpenEarnings!();
    } else {
      context.push('/driver/earnings');
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final user = context.watch<Session>().user;
    final firstName = user?.fullName.split(' ').first ?? 'conductor';
    final online = _online;

    final header = <Widget>[
      HomeGreeting(
        name: firstName,
        subtitle: online ? 'Listo para recibir solicitudes' : 'Conduce seguro con Bugie',
      ),
      const SizedBox(height: 12),
      _StatusCard(
        driver: _driver,
        online: online,
        onToggle: _toggleOnline,
      ),
      _AnimatedReveal(
        visible: _activeTrip != null,
        child: _activeTrip == null
            ? const SizedBox.shrink()
            : Padding(
                padding: const EdgeInsets.only(top: 10),
                child: _ActiveTripCard(
                  trip: _activeTrip!,
                  onTap: () async {
                    await context.push('/driver/trip-in-progress');
                    if (mounted) _refreshAll();
                  },
                ),
              ),
      ),
      const SizedBox(height: 10),
      _TodaySummary(
        loaded: _summaryLoaded,
        totalTrips: _totalTrips,
        totalEarned: _totalEarned,
        monthEarned: _monthEarned,
        onTap: _openEarnings,
      ),
      const SizedBox(height: 10),
    ];

    Widget map() => DriverAccountGate(
          child: DriverDemandMap(
            center: _mapCenter,
            driverPos: _pos,
            demand: _demand,
            online: online,
            loading: _demandLoading && _demand == null,
            problem: _demandProblem,
            onTapRequest: _openRequest,
            onTapStatus: online ? _openRequests : _toggleOnline,
          ),
        );

    final sos = HomeSosCard(onTap: () => context.push('/driver/sos'));

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        bottom: false,
        child: LayoutBuilder(builder: (context, constraints) {
          // ¿Entra todo con el mapa llenando el espacio? Si la pantalla es
          // baja o la letra es grande, pasamos a una columna con scroll y
          // mapa de alto fijo para que nada se desborde.
          final scale = MediaQuery.textScalerOf(context).scale(1);
          final needed = 470 * scale + 220;
          final roomy = constraints.maxHeight >= needed;
          final showSafety = constraints.maxHeight >= needed + 110;

          if (roomy) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ...header,
                  Expanded(child: map()),
                  const SizedBox(height: 12),
                  if (showSafety) ...[
                    const HomeSafetyCard(),
                    const SizedBox(height: 10),
                  ],
                  sos,
                ],
              ),
            );
          }

          final mapHeight =
              (constraints.maxHeight * 0.55).clamp(240.0, 420.0).toDouble();
          return RefreshIndicator(
            onRefresh: _refreshAll,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ...header,
                  SizedBox(height: mapHeight, child: map()),
                  const SizedBox(height: 12),
                  sos,
                  const SizedBox(height: 10),
                  const HomeSafetyCard(),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }
}

// ── Piezas del inicio ─────────────────────────────────────────────────────

bool _noAnim(BuildContext context) =>
    MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Estado (En línea / Desconectado) con punto que late + botón grande.
class _StatusCard extends StatelessWidget {
  final Driver? driver;
  final bool online;
  final VoidCallback onToggle;
  const _StatusCard({
    required this.driver,
    required this.online,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final noAnim = _noAnim(context);
    final d = driver;
    final blocked = d?.isBlocked == true;
    final status = d?.status;

    // Texto de ayuda bajo el estado, según la cuenta.
    final String hint;
    if (online) {
      hint = 'Recibes solicitudes. Mantén el GPS activo.';
    } else if (d == null) {
      hint = 'Cargando tu estado…';
    } else if (blocked) {
      hint = 'Tu cuenta no puede conectarse. Revisa el detalle abajo.';
    } else if (status == DriverStatus.pendingDocs) {
      hint = 'Sube tus documentos para poder conectarte.';
    } else if (status == DriverStatus.underReview) {
      hint = 'Tu cuenta está en revisión. Te avisaremos al aprobarla.';
    } else if (status == DriverStatus.expiredDocs) {
      hint = 'Tienes documentos vencidos. Actualízalos para conectarte.';
    } else {
      hint = 'Te pediremos una selfie para verificar que eres tú.';
    }

    // Botón: qué dice y si se muestra.
    String? label;
    IconData icon = Icons.power_settings_new;
    Color btnColor = BugieColors.success;
    if (online) {
      label = 'Desconectarme';
      icon = Icons.power_off;
      btnColor = BugieColors.danger;
    } else if (d != null && !blocked) {
      if (status == DriverStatus.approved) {
        label = 'Conectarme';
        icon = Icons.camera_alt_outlined;
      } else if (status == DriverStatus.pendingDocs ||
          status == DriverStatus.expiredDocs) {
        label = 'Ver mis documentos';
        icon = Icons.badge_outlined;
        btnColor = BugieColors.primary;
      }
    }

    final accent = online ? BugieColors.success : c.textMuted;

    return AnimatedContainer(
      duration: noAnim ? Duration.zero : const Duration(milliseconds: 350),
      curve: Curves.easeOut,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: online ? BugieColors.success.withValues(alpha: 0.10) : c.surface,
        borderRadius: BorderRadius.circular(BugieRadius.md),
        border: Border.all(
          color: online ? BugieColors.success.withValues(alpha: 0.45) : c.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _PulseDot(color: accent, active: online),
              const SizedBox(width: 10),
              Expanded(
                child: AnimatedSwitcher(
                  duration:
                      noAnim ? Duration.zero : const Duration(milliseconds: 280),
                  transitionBuilder: (child, anim) => FadeTransition(
                    opacity: anim,
                    child: SizeTransition(
                      sizeFactor: anim,
                      axisAlignment: -1,
                      child: child,
                    ),
                  ),
                  child: Column(
                    key: ValueKey('$online-$hint'),
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        online ? 'En línea' : 'Desconectado',
                        style: TextStyle(
                          color: online ? BugieColors.success : c.text,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        hint,
                        style: TextStyle(color: c.textMuted, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          if (label != null) ...[
            const SizedBox(height: 12),
            _BigButton(
              key: ValueKey(label),
              label: label,
              icon: icon,
              color: btnColor,
              // En línea, "Desconectarme" va con borde: el rojo lleno queda
              // solo para SOS y no compite con la información.
              outlined: online,
              onTap: onToggle,
            ),
          ],
        ],
      ),
    );
  }
}

/// Botón grande con color animado y leve "hundido" al tocar.
class _BigButton extends StatefulWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool outlined;
  final VoidCallback onTap;
  const _BigButton({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
    this.outlined = false,
  });

  @override
  State<_BigButton> createState() => _BigButtonState();
}

class _BigButtonState extends State<_BigButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final noAnim = _noAnim(context);
    return AnimatedScale(
      scale: _pressed && !noAnim ? 0.97 : 1,
      duration: const Duration(milliseconds: 120),
      child: AnimatedContainer(
        duration: noAnim ? Duration.zero : const Duration(milliseconds: 300),
        decoration: BoxDecoration(
          color: widget.outlined
              ? widget.color.withValues(alpha: 0.08)
              : widget.color,
          borderRadius: BorderRadius.circular(BugieRadius.sm),
          border: widget.outlined
              ? Border.all(
                  color: widget.color.withValues(alpha: 0.6), width: 1.4)
              : null,
          boxShadow: widget.outlined
              ? null
              : [
                  BoxShadow(
                    color: widget.color.withValues(alpha: 0.30),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(BugieRadius.sm),
            onTap: widget.onTap,
            onHighlightChanged: (v) => setState(() => _pressed = v),
            child: ConstrainedBox(
              constraints:
                  BoxConstraints(minHeight: widget.outlined ? 48 : 54),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(widget.icon,
                        color: widget.outlined ? widget.color : Colors.white,
                        size: widget.outlined ? 20 : 24),
                    const SizedBox(width: 10),
                    Flexible(
                      child: Text(
                        widget.label,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color:
                              widget.outlined ? widget.color : Colors.white,
                          fontSize: widget.outlined ? 15 : 17,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Punto de estado: en línea late con un halo; desconectado queda quieto.
class _PulseDot extends StatefulWidget {
  final Color color;
  final bool active;
  const _PulseDot({required this.color, required this.active});

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  );

  void _sync() {
    if (widget.active && !_noAnim(context)) {
      if (!_ctrl.isAnimating) _ctrl.repeat();
    } else {
      _ctrl.stop();
      _ctrl.value = 0;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(_PulseDot old) {
    super.didUpdateWidget(old);
    _sync();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 26,
      height: 26,
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (_, __) {
          final t = _ctrl.value;
          return Stack(
            alignment: Alignment.center,
            children: [
              if (widget.active)
                Container(
                  width: 12 + 14 * t,
                  height: 12 + 14 * t,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: widget.color.withValues(alpha: 0.45 * (1 - t)),
                  ),
                ),
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Aparece/desaparece con tamaño + fundido.
class _AnimatedReveal extends StatelessWidget {
  final bool visible;
  final Widget child;
  const _AnimatedReveal({required this.visible, required this.child});

  @override
  Widget build(BuildContext context) {
    final noAnim = _noAnim(context);
    return AnimatedSize(
      duration: noAnim ? Duration.zero : const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: AnimatedOpacity(
        duration: noAnim ? Duration.zero : const Duration(milliseconds: 320),
        opacity: visible ? 1 : 0,
        child: visible ? child : const SizedBox(width: double.infinity),
      ),
    );
  }
}

/// Tarjeta fija de viaje en curso.
class _ActiveTripCard extends StatelessWidget {
  final Trip trip;
  final VoidCallback onTap;
  const _ActiveTripCard({required this.trip, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final sos = trip.status == TripStatus.sosActive;
    final color = sos ? BugieColors.danger : BugieColors.primary;
    final String title;
    if (sos) {
      title = 'SOS activo';
    } else if (trip.status == TripStatus.accepted) {
      title = trip.isDelivery ? 'Envío aceptado' : 'Viaje aceptado';
    } else {
      title = trip.isDelivery ? 'Envío en curso' : 'Viaje en curso';
    }
    final dest = trip.status == TripStatus.accepted
        ? 'Recojo: ${trip.originAddress}'
        : 'Destino: ${trip.destAddress}';

    return Material(
      color: color,
      borderRadius: BorderRadius.circular(BugieRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(BugieRadius.md),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Icon(
                sos
                    ? Icons.emergency
                    : (trip.isDelivery
                        ? Icons.inventory_2
                        : Icons.directions_car),
                color: Colors.white,
                size: 28,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(dest,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 13)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Continuar',
                      style: TextStyle(
                          color: Colors.white, fontWeight: FontWeight.bold)),
                  Icon(Icons.chevron_right, color: Colors.white),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Resumen de /payments/earnings: este mes y total (con viajes).
/// Toca → Ganancias.
class _TodaySummary extends StatelessWidget {
  final bool loaded;
  final int? totalTrips;
  final double? totalEarned;
  final double? monthEarned;
  final VoidCallback onTap;
  const _TodaySummary({
    required this.loaded,
    required this.totalTrips,
    required this.totalEarned,
    required this.monthEarned,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Material(
      color: c.surface,
      borderRadius: BorderRadius.circular(BugieRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(BugieRadius.md),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BugieRadius.md),
            border: Border.all(color: c.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: _Stat(
                  label: 'Este mes',
                  amount: monthEarned,
                  loaded: loaded,
                ),
              ),
              Container(width: 1, height: 36, color: c.border),
              Expanded(
                child: _Stat(
                  label: 'Total',
                  amount: totalEarned,
                  loaded: loaded,
                  extra: totalTrips == null
                      ? null
                      : '$totalTrips ${totalTrips == 1 ? 'viaje' : 'viajes'}',
                ),
              ),
              Icon(Icons.chevron_right, color: c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final double? amount;
  final bool loaded;
  final String? extra;
  const _Stat({
    required this.label,
    required this.amount,
    required this.loaded,
    this.extra,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final noAnim = _noAnim(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            extra == null ? label : '$label · $extra',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: c.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 2),
          if (!loaded)
            Text('…', style: TextStyle(color: c.textMuted, fontSize: 18))
          else if (amount == null)
            Text('—',
                style: TextStyle(
                    color: c.text, fontSize: 18, fontWeight: FontWeight.bold))
          else
            // El monto "cuenta" hasta su valor (sin animación si se pidió).
            TweenAnimationBuilder<double>(
              tween: Tween(begin: noAnim ? amount! : 0, end: amount!),
              duration:
                  noAnim ? Duration.zero : const Duration(milliseconds: 700),
              curve: Curves.easeOutCubic,
              builder: (_, v, __) => FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  'S/ ${v.toStringAsFixed(2)}',
                  maxLines: 1,
                  style: TextStyle(
                    color: c.text,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
