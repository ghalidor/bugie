import 'package:flutter/material.dart';

import '../theme/bugie_theme.dart';

/// Confirmación antes de cerrar sesión (pasajero y conductor).
/// Devuelve true si el usuario confirma.
Future<bool> confirmLogout(BuildContext context) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      // Un poco más ancho que el estándar (margen 24 en vez de 40) para que
      // "Cancelar" y "Cerrar sesión" entren en una sola fila en 360 px.
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      title: const Text('¿Cerrar sesión?'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          // Texto blanco sobre rojo (foregroundColor explícito).
          style: FilledButton.styleFrom(
            backgroundColor: BugieColors.danger,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          ),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Cerrar sesión'),
        ),
      ],
    ),
  );
  return ok == true;
}
