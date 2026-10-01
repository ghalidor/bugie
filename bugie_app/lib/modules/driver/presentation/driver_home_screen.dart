import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/current_location_map.dart';
import '../../passenger/presentation/home_shared.dart';

/// INICIO del conductor. Misma estructura que el pasajero de la parte del
/// buscador hacia abajo. El mapa es FLEXIBLE: ocupa el espacio entre el
/// buscador y los dos elementos de abajo (card + SOS), responsivo y sin scroll.
class DriverHomeScreen extends StatelessWidget {
  const DriverHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final user = context.watch<Session>().user;
    final firstName = user?.fullName.split(' ').first ?? 'conductor';

    return Scaffold(
      backgroundColor: c.bg,
      body: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            children: [
              HomeGreeting(name: firstName, subtitle: 'Conduce seguro con Bugie'),
              const SizedBox(height: 14),
              const HomeSearchBar(hint: 'Buscar'),
              const SizedBox(height: 14),

              // Mapa flexible: llena el espacio disponible.
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) =>
                      CurrentLocationMap(height: constraints.maxHeight),
                ),
              ),
              const SizedBox(height: 14),

              const HomeSafetyCard(),
              const SizedBox(height: 12),
              HomeSosCard(onTap: () => context.push('/driver/sos')),
            ],
          ),
        ),
      ),
    );
  }
}
