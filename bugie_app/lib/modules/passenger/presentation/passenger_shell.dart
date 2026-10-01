import 'package:flutter/material.dart';
import '../../../core/theme/bugie_theme.dart';
import 'package:provider/provider.dart';
import '../../../core/services/in_app_alert_service.dart';
import '../../auth/data/auth_repository.dart';
import 'passenger_home_screen.dart';
import 'trips_history_screen.dart';
import 'account_screen.dart';

/// Contenedor del pasajero con barra de navegación inferior:
/// Inicio · Viajes · Envíos · Cuenta.
/// Reemplaza al antiguo dashboard con menú por defecto.
class PassengerShell extends StatefulWidget {
  const PassengerShell({super.key});

  @override
  State<PassengerShell> createState() => _PassengerShellState();
}

class _PassengerShellState extends State<PassengerShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkDocs());
  }

  // Al entrar al dashboard, si el pasajero no verificó su DNI, muestra una
  // alerta persistente (se mantiene entre pantallas hasta que la cierre).
  Future<void> _checkDocs() async {
    try {
      final p = await context.read<AuthRepository>().getMyProfile();
      if (!mounted || p == null || p.isVerified) return;
      InAppAlertService().show(AlertData(
        type: AlertType.warning,
        title: 'Verifica tu identidad',
        body: 'Sube tu DNI para poder solicitar viajes y envíos.',
        route: '/passenger/verification',
        actionLabel: 'Subir',
      ));
    } catch (_) {}
  }

  // Se mantienen vivas con IndexedStack (no se reconstruyen al cambiar de tab).
  static const _pages = <Widget>[
    PassengerHomeScreen(),                       // Inicio
    PassengerTripsScreen(serviceType: 0),        // Viajes
    PassengerTripsScreen(serviceType: 1),        // Envíos
    AccountScreen(),                             // Cuenta (menú)
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
              label: 'Inicio',
            ),
            NavigationDestination(
              icon: Icon(Icons.directions_car_outlined),
              selectedIcon: Icon(Icons.directions_car),
              label: 'Viajes',
            ),
            NavigationDestination(
              icon: Icon(Icons.local_shipping_outlined),
              selectedIcon: Icon(Icons.local_shipping),
              label: 'Envíos',
            ),
            NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: 'Cuenta',
            ),
          ],
        ),
      ),
    );
  }
}
