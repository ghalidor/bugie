import 'package:flutter/material.dart';
import '../../../core/theme/bugie_theme.dart';
import 'package:provider/provider.dart';
import '../../../core/services/in_app_alert_service.dart';
import '../data/driver_repository.dart';
import '../domain/driver_model.dart';
import 'driver_home_screen.dart';
import 'driver_typed_list_screen.dart';
import 'driver_account_screen.dart';

/// Contenedor del conductor con barra inferior:
/// Inicio · Viajes · Envíos · Cuenta.
class DriverShell extends StatefulWidget {
  const DriverShell({super.key});

  @override
  State<DriverShell> createState() => _DriverShellState();
}

class _DriverShellState extends State<DriverShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkDocs());
  }

  // Al entrar al dashboard, si al conductor le faltan documentos, muestra una
  // alerta persistente (se mantiene entre pantallas hasta que la cierre).
  Future<void> _checkDocs() async {
    try {
      final d = await context.read<DriverRepository>().getMyProfile();
      if (!mounted || d == null) return;
      if (d.status == DriverStatus.pendingDocs) {
        InAppAlertService().show(AlertData(
          type: AlertType.warning,
          title: 'Completa tus documentos',
          body: 'Sube tus documentos para poder recibir viajes.',
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

  static const _pages = <Widget>[
    DriverHomeScreen(),      // Inicio
    DriverTypedListScreen(   // Viajes
        serviceType: 0, title: 'Viajes', icon: Icons.directions_car),
    DriverTypedListScreen(   // Envíos
        serviceType: 1, title: 'Envíos', icon: Icons.local_shipping),
    DriverAccountScreen(),   // Cuenta
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          backgroundColor: c.surface,
          indicatorColor: BugieColors.primary.withOpacity(0.15),
          labelTextStyle: WidgetStateProperty.all(
            TextStyle(fontSize: 12, color: c.text),
          ),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'Inicio'),
            NavigationDestination(
                icon: Icon(Icons.directions_car_outlined),
                selectedIcon: Icon(Icons.directions_car),
                label: 'Viajes'),
            NavigationDestination(
                icon: Icon(Icons.local_shipping_outlined),
                selectedIcon: Icon(Icons.local_shipping),
                label: 'Envíos'),
            NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'Cuenta'),
          ],
        ),
      ),
    );
  }
}
