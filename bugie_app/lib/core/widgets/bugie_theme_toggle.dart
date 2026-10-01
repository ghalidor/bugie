import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/theme_controller.dart';

/// Botón sol/luna para alternar entre modo claro y oscuro.
///
/// Se puede poner en cualquier `AppBar(actions: [...])`, header o fila.
/// Lee y escribe el modo en [ThemeController] (ya provisto en main.dart),
/// así que el cambio afecta a TODA la app al instante.
///
/// Uso:
///   AppBar(actions: const [BugieThemeToggle()])
class BugieThemeToggle extends StatelessWidget {
  /// Color del icono. Si es null usa el color por defecto del IconButton
  /// (útil sobre AppBar oscuro donde quieres blanco: pásale Colors.white).
  final Color? color;

  const BugieThemeToggle({super.key, this.color});

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<ThemeController>();
    // Consideramos "oscuro" tanto el modo dark explícito como cuando el
    // sistema está en oscuro. Al tocar, forzamos el modo contrario explícito.
    final platformDark =
        MediaQuery.platformBrightnessOf(context) == Brightness.dark;
    final isDark = ctrl.mode == ThemeMode.dark ||
        (ctrl.mode == ThemeMode.system && platformDark);

    return IconButton(
      tooltip: isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
      icon: Icon(
        isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
        color: color,
      ),
      onPressed: () {
        ctrl.setMode(isDark ? ThemeMode.light : ThemeMode.dark);
      },
    );
  }
}
