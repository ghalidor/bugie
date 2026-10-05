import 'dart:async';

import 'package:flutter/material.dart';
import '../../../core/theme/bugie_theme.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_client.dart';
import '../../../core/services/fcm_service.dart';
import '../../../core/services/in_app_alert_service.dart';
import '../../../core/services/location_tracking_service.dart';
import '../../../core/services/notification_prefs.dart';
import '../../../core/services/request_alert_service.dart';
import '../../trips/data/trips_repository.dart';
import '../data/driver_repository.dart';
import '../domain/driver_model.dart';
import 'driver_idle_tracking.dart';
import 'driver_home_screen.dart';
import 'driver_scheduled_screen.dart';
import 'driver_account_screen.dart';
import 'earnings_screen.dart';
import 'incoming_requests_screen.dart';
import 'documents_screen.dart' show DriverDocsDeadline;

/// Contenedor del conductor con barra inferior:
/// Inicio · Pedidos · Agenda · Ganancias · Cuenta.
///
/// El historial de viajes y envíos (antes pestañas Viajes / Envíos) está en
/// Cuenta → "Mis viajes y envíos" (/driver/my-trips).
class DriverShell extends StatefulWidget {
  const DriverShell({super.key});

  @override
  State<DriverShell> createState() => _DriverShellState();
}

class _DriverShellState extends State<DriverShell>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  static const _tabHome = 0;
  static const _tabRequests = 1;
  static const _tabAgenda = 2;
  static const _tabEarnings = 3;
  static const _tabAccount = 4;

  int _index = _tabHome;

  /// Cambia cada vez que se entra a Ganancias para que recargue sus datos.
  int _earningsGen = 0;

  /// Solicitudes visibles para el badge de "Pedidos".
  int _pendingCount = 0;
  Timer? _pendingTimer;
  bool _foreground = true;
  bool _loadingPending = false;

  /// Fundido al cambiar de pestaña (empieza completo).
  late final AnimationController _tabFade = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
    value: 1,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkDocs();
      _refreshPending();
    });
    FcmService.driverAccount.addListener(_onAccountPush);
    // Push de solicitud nueva (panel grande) o cambio en línea/desconectado:
    // actualizamos el badge al toque.
    RequestAlertService().state.addListener(_onRequestPush);
    NotificationPrefs.driverOnline.addListener(_refreshPending);
    // Mientras esté en línea, refresco ligero cada ~20 s.
    _pendingTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (NotificationPrefs.driverOnline.value != false) _refreshPending();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    FcmService.driverAccount.removeListener(_onAccountPush);
    RequestAlertService().state.removeListener(_onRequestPush);
    NotificationPrefs.driverOnline.removeListener(_refreshPending);
    _pendingTimer?.cancel();
    _tabFade.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final wasForeground = _foreground;
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground && !wasForeground) _refreshPending();
  }

  void _onRequestPush() {
    if (RequestAlertService().state.value != null) _refreshPending();
  }

  /// Cuenta las solicitudes que el conductor ve en "Pedidos" (misma fuente
  /// que esa pantalla: /trips/pending). Sin red, se mantiene el último dato.
  Future<void> _refreshPending() async {
    if (!mounted || !_foreground || _loadingPending) return;
    _loadingPending = true;
    try {
      final list = await context.read<TripsRepository>().getPending();
      if (mounted && list.length != _pendingCount) {
        setState(() => _pendingCount = list.length);
      }
    } catch (_) {
      // Sin red: dejamos el número anterior.
    } finally {
      _loadingPending = false;
    }
  }

  void _select(int i) {
    if (i == _index) return;
    setState(() {
      _index = i;
      if (i == _tabEarnings) _earningsGen++;
    });
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (noAnim) {
      _tabFade.value = 1;
    } else {
      _tabFade.forward(from: 0);
    }
    // Al entrar o salir de Pedidos el número pudo cambiar.
    _refreshPending();
  }

  // Push de cambio de estado (aprobada, rechazada, suspendida, reactivada o
  // respuesta a la revisión): volvemos a revisar el estado sin reiniciar la
  // app. La tarjeta del inicio (DriverAccountGate) se refresca sola.
  void _onAccountPush() {
    final e = FcmService.driverAccount.value;
    if (e != null && e.isStatusChange && mounted) _checkDocs();
  }

  // Al entrar al dashboard, si al conductor le faltan documentos, muestra una
  // alerta persistente (se mantiene entre pantallas hasta que la cierre).
  Future<void> _checkDocs() async {
    try {
      final d = await context.read<DriverRepository>().getMyProfile();
      if (!mounted || d == null) return;

      // En línea: mantener actualizada su posición en el backend para que
      // le lleguen las solicitudes cercanas a donde está realmente.
      final tracking = context.read<LocationTrackingService>();
      if (d.isOnline && !tracking.isRunning) {
        startDriverIdleTracking(context);
      }

      // Suspendida / no aceptada y ya desconectado: no seguimos mandando su
      // posición de "en línea sin viaje". La tarjeta del inicio explica todo.
      if (d.isBlocked) {
        if (!d.isOnline && tracking.mode == TrackingMode.driverIdle) {
          tracking.stop();
        }
        return;
      }

      // Aprobado por excepción: tiene plazo para completar documentos.
      // Va primero porque si no completa a tiempo se desactiva la cuenta.
      DriverDocsDeadline? deadline;
      try {
        deadline = await DriverDocsDeadline.fetch(context.read<ApiClient>());
      } catch (_) {}
      if (!mounted) return;
      if (deadline != null && deadline.hasDeadline) {
        final faltan = deadline.missingLabels;
        InAppAlertService().show(AlertData(
          type: AlertType.warning,
          title: 'Completa tus documentos antes del ${deadline.deadlineText}',
          body: faltan.isEmpty
              ? 'Si no los completas a tiempo, tu cuenta se desactivará.'
              : 'Te faltan: ${faltan.join(', ')}. Si no los completas a tiempo, tu cuenta se desactivará.',
          route: '/driver/documents',
          actionLabel: 'Completar',
        ));
      }

      if (d.status == DriverStatus.pendingDocs) {
        InAppAlertService().show(AlertData(
          type: AlertType.warning,
          title: 'Completa tus documentos',
          body: (deadline?.missing.contains('profile_photo') ?? false)
              ? 'Sube tus documentos y tu foto de perfil para poder recibir viajes.'
              : 'Sube tus documentos para poder recibir viajes.',
          route: '/driver/documents',
          actionLabel: 'Subir',
        ));
      } else if (d.status == DriverStatus.approved && !d.isOnline) {
        // Documentos aprobados pero desconectado: sin estar en línea el backend
        // NO le manda solicitudes. Avisamos para que se conecte.
        InAppAlertService().show(AlertData(
          type: AlertType.warning,
          title: 'No estás en línea',
          body: 'Conéctate para recibir solicitudes de viajes y envíos.',
          route: '/driver/go-online',
          actionLabel: 'Conectarme',
        ));
      }
    } catch (_) {}
  }

  Widget _page(int i) {
    // Todas las pestañas se construyen desde el inicio y quedan vivas en el
    // IndexedStack (como antes del rediseño).
    switch (i) {
      case _tabHome:
        return DriverHomeScreen(
          onOpenRequests: () => _select(_tabRequests),
          onOpenEarnings: () => _select(_tabEarnings),
        );
      case _tabRequests:
        // Siempre viva (como las demás): su consulta periódica funciona
        // aunque no esté a la vista. Ya no salta sola al viaje en curso: la
        // franja "Viaje en curso · Volver" (ActiveTripFrame) lleva a él.
        return const IncomingRequestsScreen(showBack: false);
      case _tabAgenda:
        return const DriverScheduledScreen();
      case _tabEarnings:
        return EarningsScreen(
            key: ValueKey('earnings-$_earningsGen'), showBack: false);
      case _tabAccount:
      default:
        return const DriverAccountScreen();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;

    return Scaffold(
      backgroundColor: c.bg,
      // Las pestañas que no se ven quedan con TickerMode apagado: sus
      // animaciones y consultas "solo mientras se ve" se pausan.
      // Al cambiar de pestaña, la nueva aparece con un fundido corto
      // (sin reconstruir las pestañas: conservan su estado).
      body: AnimatedBuilder(
        animation: _tabFade,
        builder: (context, child) {
          final t = Curves.easeOut.transform(_tabFade.value);
          return Opacity(
            opacity: 0.4 + 0.6 * t,
            child: Transform.translate(
              offset: Offset(0, 8 * (1 - t)),
              child: child,
            ),
          );
        },
        child: IndexedStack(
          index: _index,
          children: [
            for (var i = 0; i < 5; i++)
              TickerMode(enabled: i == _index, child: _page(i)),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: c.surface,
          indicatorColor: BugieColors.primary.withOpacity(0.15),
          labelTextStyle: WidgetStateProperty.all(
            TextStyle(fontSize: 11, color: c.text, overflow: TextOverflow.ellipsis),
          ),
        ),
        // El texto del menú no crece más de 1.2x para que las 5 etiquetas
        // entren en celulares de 320 dp aun con letra grande.
        child: MediaQuery.withClampedTextScaling(
          maxScaleFactor: 1.2,
          child: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: _select,
            destinations: [
              const NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home),
                  label: 'Inicio'),
              NavigationDestination(
                  icon: _RequestsBadge(
                      count: _pendingCount,
                      child: const Icon(Icons.notifications_active_outlined)),
                  selectedIcon: _RequestsBadge(
                      count: _pendingCount,
                      child: const Icon(Icons.notifications_active)),
                  label: 'Solicitudes',
                  tooltip: 'Solicitudes de viaje y envío'),
              const NavigationDestination(
                  icon: Icon(Icons.event_outlined),
                  selectedIcon: Icon(Icons.event),
                  label: 'Agenda',
                  tooltip: 'Viajes programados'),
              const NavigationDestination(
                  icon: Icon(Icons.account_balance_wallet_outlined),
                  selectedIcon: Icon(Icons.account_balance_wallet),
                  label: 'Ganancias'),
              const NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Cuenta'),
            ],
          ),
        ),
      ),
    );
  }
}

/// Badge rojo con la cantidad de solicitudes. Aparece con un "pop" y late
/// una vez cuando el número sube (sin animación si el celular las quitó).
class _RequestsBadge extends StatefulWidget {
  final int count;
  final Widget child;
  const _RequestsBadge({required this.count, required this.child});

  @override
  State<_RequestsBadge> createState() => _RequestsBadgeState();
}

class _RequestsBadgeState extends State<_RequestsBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _bump = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
  );

  @override
  void didUpdateWidget(_RequestsBadge old) {
    super.didUpdateWidget(old);
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (widget.count > old.count && !noAnim) _bump.forward(from: 0);
  }

  @override
  void dispose() {
    _bump.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final text = widget.count > 99 ? '99+' : '${widget.count}';
    return Semantics(
      label: widget.count > 0 ? '${widget.count} solicitudes' : null,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          widget.child,
          Positioned(
            right: -10,
            top: -6,
            child: AnimatedScale(
              scale: widget.count > 0 ? 1 : 0,
              duration:
                  noAnim ? Duration.zero : const Duration(milliseconds: 260),
              curve: Curves.easeOutBack,
              child: AnimatedBuilder(
                animation: _bump,
                builder: (_, child) {
                  // Late: sube a 1.35x y vuelve.
                  final t = _bump.value;
                  final s = 1 + 0.35 * (t < 0.5 ? t * 2 : (1 - t) * 2);
                  return Transform.scale(scale: s, child: child);
                },
                child: Container(
                  constraints:
                      const BoxConstraints(minWidth: 18, minHeight: 18),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: BugieColors.danger,
                    borderRadius: BorderRadius.circular(999),
                    border:
                        Border.all(color: context.bugie.surface, width: 1.5),
                  ),
                  child: Text(
                    widget.count > 0 ? text : '',
                    textScaler: TextScaler.noScaling,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      height: 1.1,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
