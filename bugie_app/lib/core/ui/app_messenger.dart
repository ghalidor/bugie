import 'package:flutter/material.dart';
import '../theme/bugie_theme.dart';

/// Key global del ScaffoldMessenger. Permite mostrar SnackBars que sobreviven
/// a la navegación (por ejemplo, un mensaje de "viaje completado" justo después
/// de redirigir al dashboard).
final GlobalKey<ScaffoldMessengerState> rootMessengerKey =
    GlobalKey<ScaffoldMessengerState>();

/// Muestra un SnackBar de ÉXITO (verde) que se ve por encima de cualquier
/// pantalla, incluso tras un cambio de ruta.
void showSuccessSnack(String message) {
  final m = rootMessengerKey.currentState;
  if (m == null) return;
  m
    ..clearSnackBars()
    ..showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(message,
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
        backgroundColor: BugieColors.success,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
      ),
    );
}

/// Muestra un SnackBar de AVISO/ERROR (rojo) que sobrevive a la navegación
/// (p. ej. "Esta cuenta fue eliminada…" al abrir la app).
void showErrorSnack(String message) {
  final m = rootMessengerKey.currentState;
  if (m == null) return;
  m
    ..clearSnackBars()
    ..showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(message,
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
        backgroundColor: BugieColors.danger,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 5),
      ),
    );
}
