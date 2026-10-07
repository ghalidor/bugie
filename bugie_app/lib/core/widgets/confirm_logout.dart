import 'package:flutter/material.dart';

import '../theme/bugie_theme.dart';

/// Confirmación antes de cerrar sesión (pasajero y conductor).
/// Devuelve true si el usuario confirma.
Future<bool> confirmLogout(BuildContext context) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('¿Cerrar sesión?'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: BugieColors.danger),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Cerrar sesión'),
        ),
      ],
    ),
  );
  return ok == true;
}
