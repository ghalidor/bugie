import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_theme_toggle.dart';
import '../../../core/widgets/bugie_value_chips.dart';

/// Pantalla de bienvenida.
/// Usa el TEMA (claro/oscuro): fondo, textos y botones salen de
/// bugie_theme.dart vía `context.bugie`, así que respeta el modo actual.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie; // tokens adaptativos (claro/oscuro)

    return Scaffold(
      backgroundColor: c.bg, // fondo del tema (por defecto oscuro)
      body: SafeArea(
        child: Stack(
          children: [
            // Contenido con scroll seguro: llena el alto disponible y,
            // si no cabe (pantallas chicas), permite desplazar.
            LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  child: ConstrainedBox(
                    constraints:
                        BoxConstraints(minHeight: constraints.maxHeight),
                    child: IntrinsicHeight(
                      child: Padding(
                        padding: const EdgeInsets.all(BugieSpacing.lg),
                        child: Column(
                          children: [
                            const Spacer(flex: 2),

                            // Wordmark "bugie" (se ve en claro y oscuro)
                            Image.asset(
                              'assets/logo.png',
                              height: 62,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => Text(
                                'bugie',
                                style: TextStyle(
                                  fontFamily: kFontHeading,
                                  fontSize: 44,
                                  fontWeight: FontWeight.bold,
                                  color: c.text,
                                ),
                              ),
                            ),
                            const SizedBox(height: BugieSpacing.sm),

                            Text(
                              'Tu app de transporte seguro',
                              style: TextStyle(color: c.textMuted, fontSize: 15),
                            ),
                            const SizedBox(height: BugieSpacing.lg),

                            // Chips de marca (Moderno, Seguro, Cercano, Claro, Ágil)
                            const BugieValueChips(),

                            const Spacer(flex: 2),

                            // Beneficios
                            const _Feature(
                              icon: Icons.verified_user,
                              text: 'Conductores verificados',
                            ),
                            const _Feature(
                              icon: Icons.location_on,
                              text: 'Tracking en tiempo real',
                            ),
                            const _Feature(
                              icon: Icons.shield,
                              text: 'Botón SOS 24/7',
                            ),

                            const Spacer(flex: 2),

                            // Botones de la plantilla:
                            //  - primario con gradiente
                            //  - secundario outline (adaptativo)
                            BugieButtons.primary(
                              text: 'Iniciar sesión',
                              onPressed: () => context.push('/login'),
                            ),
                            const SizedBox(height: BugieSpacing.sm + 4),
                            BugieButtons.secondary(
                              text: 'Crear cuenta',
                              onPressed: () => context.push('/register'),
                            ),
                            const SizedBox(height: BugieSpacing.xl),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),

            // Toggle claro/oscuro arriba a la derecha (color del tema).
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.only(top: 4, right: 4),
                child: BugieThemeToggle(color: c.text),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Línea de beneficio con ícono (color de marca) + texto del tema.
class _Feature extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Feature({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BugieSpacing.xs + 2),
      child: Row(
        children: [
          Icon(icon, color: BugieColors.primary, size: 22),
          const SizedBox(width: BugieSpacing.sm + 4),
          Text(text, style: TextStyle(color: c.text, fontSize: 15)),
        ],
      ),
    );
  }
}
