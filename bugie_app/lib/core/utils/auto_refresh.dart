import 'package:flutter/widgets.dart';

/// Observador de rutas de la app (registrado en GoRouter.observers).
/// Permite saber cuándo el usuario VUELVE a una pantalla.
final RouteObserver<PageRoute<dynamic>> appRouteObserver =
    RouteObserver<PageRoute<dynamic>>();

/// Recarga una lista sola, sin polling:
///  - al volver a la pantalla (se cerró la que estaba encima), y
///  - al reanudar la app (vuelve del segundo plano) si la pantalla está visible.
///
/// Uso: `with AutoRefreshOnReturn` e implementar [onAutoRefresh].
mixin AutoRefreshOnReturn<T extends StatefulWidget> on State<T>
    implements RouteAware {
  PageRoute<dynamic>? _observedRoute;
  AppLifecycleListener? _lifecycle;
  DateTime _lastAutoRefresh = DateTime.fromMillisecondsSinceEpoch(0);

  /// Recarga silenciosa (sin spinner de pantalla completa).
  Future<void> onAutoRefresh();

  void _trigger() {
    if (!mounted) return;
    // Evita dobles recargas seguidas (pop + resume casi a la vez).
    final now = DateTime.now();
    if (now.difference(_lastAutoRefresh) < const Duration(seconds: 2)) return;
    _lastAutoRefresh = now;
    onAutoRefresh();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route is PageRoute && route != _observedRoute) {
      if (_observedRoute != null) appRouteObserver.unsubscribe(this);
      _observedRoute = route;
      appRouteObserver.subscribe(this, route);
    }
    _lifecycle ??= AppLifecycleListener(onResume: () {
      if (_observedRoute?.isCurrent ?? true) _trigger();
    });
  }

  @override
  void dispose() {
    appRouteObserver.unsubscribe(this);
    _lifecycle?.dispose();
    super.dispose();
  }

  @override
  void didPopNext() => _trigger();

  @override
  void didPush() {}

  @override
  void didPop() {}

  @override
  void didPushNext() {}
}
