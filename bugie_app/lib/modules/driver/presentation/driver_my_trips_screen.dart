import 'package:flutter/material.dart';

import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import 'driver_typed_list_screen.dart';

/// "Mis viajes y envíos" del conductor (Cuenta → Trabajo).
///
/// Reemplaza a las antiguas pestañas Viajes y Envíos del menú inferior:
/// reutiliza la misma lista (DriverTypedListScreen) con un filtro
/// Todos / Viajes / Envíos. Nada se pierde: solicitudes, en curso,
/// programados y terminados siguen apareciendo igual que antes.
class DriverMyTripsScreen extends StatefulWidget {
  const DriverMyTripsScreen({super.key});

  @override
  State<DriverMyTripsScreen> createState() => _DriverMyTripsScreenState();
}

class _DriverMyTripsScreenState extends State<DriverMyTripsScreen> {
  /// null = todos, 0 = viajes, 1 = envíos.
  int? _filter;

  static const _options = <(int?, String, IconData)>[
    (null, 'Todos', Icons.list_alt),
    (0, 'Viajes', Icons.directions_car),
    (1, 'Envíos', Icons.inventory_2),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final noAnim = MediaQuery.maybeDisableAnimationsOf(context) ?? false;

    return Scaffold(
      backgroundColor: c.bg,
      appBar: const BugieInternalHeader(title: 'Mis viajes y envíos'),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            // Filtro: chips que se acomodan solos si no entran en una fila.
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    for (final o in _options)
                      ChoiceChip(
                        avatar: Icon(
                          o.$3,
                          size: 18,
                          color: _filter == o.$1
                              ? Colors.white
                              : BugieColors.primary,
                        ),
                        label: Text(o.$2),
                        selected: _filter == o.$1,
                        showCheckmark: false,
                        selectedColor: BugieColors.primary,
                        labelStyle: TextStyle(
                          color: _filter == o.$1 ? Colors.white : c.text,
                          fontWeight: FontWeight.w600,
                        ),
                        onSelected: (_) => setState(() => _filter = o.$1),
                      ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: AnimatedSwitcher(
                duration:
                    noAnim ? Duration.zero : const Duration(milliseconds: 250),
                switchInCurve: Curves.easeOut,
                transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: SlideTransition(
                    position: Tween(
                      begin: const Offset(0, 0.03),
                      end: Offset.zero,
                    ).animate(anim),
                    child: child,
                  ),
                ),
                child: DriverTypedListScreen(
                  key: ValueKey(_filter ?? -1),
                  serviceType: _filter,
                  title: 'Mis viajes y envíos',
                  icon: Icons.list_alt,
                  embedded: true,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
