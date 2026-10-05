import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_internal_header.dart';

/// Selector de servicio del pasajero.
/// Antes de solicitar, el pasajero elige entre **Viaje** o **Envío**.
/// Al elegir, entra a la pantalla de solicitud correspondiente
/// (cada una con su propio título: "Solicitar viaje" / "Solicitar envío").
class ServiceSelectorScreen extends StatelessWidget {
  const ServiceSelectorScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: const BugieInternalHeader(title: 'Solicitar servicio'),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('¿Qué necesitas?',
                  style: BugieText.h1.copyWith(color: c.text)),
              const SizedBox(height: 6),
              Text('Elige el tipo de servicio',
                  style: BugieText.body.copyWith(color: c.textMuted)),
              const SizedBox(height: 24),

              // Viaje → Solicitar viaje
              _ServiceCard(
                title: 'Viaje',
                subtitle: 'Muévete de manera segura y rápida.',
                icon: Icons.directions_car_filled,
                gradient: const [BugieColors.primary, BugieColors.accent2],
                onTap: () => context.push('/passenger/request'),
              ),
              const SizedBox(height: 16),

              // Envío → Solicitar envío
              _ServiceCard(
                title: 'Envío',
                subtitle: 'Enviamos lo que necesitas a donde lo necesites.',
                icon: Icons.inventory_2_rounded,
                gradient: const [BugieColors.accent2, BugieColors.accent],
                onTap: () => context.push('/passenger/delivery'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tarjeta grande de servicio con gradiente, título, descripción e ícono.
class _ServiceCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final List<Color> gradient;
  final VoidCallback onTap;

  const _ServiceCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.gradient,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // La sombra va en un contenedor aparte (antes, dentro del Ink, dejaba
    // esquinas cuadradas oscuras debajo de la tarjeta).
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: gradient.last.withValues(alpha: 0.22),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: gradient,
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 132),
            child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(title,
                          style: BugieText.h2.copyWith(color: Colors.white)),
                      const SizedBox(height: 6),
                      Text(
                        subtitle,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 13, height: 1.3),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, color: Colors.white, size: 34),
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
