import 'package:flutter/material.dart';
import '../theme/bugie_theme.dart';

/// Fila de "chips" de marca del UI Guide: Moderno, Seguro, Cercano, Claro, Ágil.
///
/// - Modo claro: pastilla de superficie con borde e icono/texto azul
///   (Ágil en rosa).
/// - Modo oscuro: pastilla oscura con borde e icono/texto azul (Ágil rosa).
///
/// Es solo decorativo (no tiene acción). Usa `Wrap` para no desbordar en
/// pantallas angostas.
class BugieValueChips extends StatelessWidget {
  const BugieValueChips({super.key});

  @override
  Widget build(BuildContext context) {
    const items = <_ChipData>[
      _ChipData('Moderno', Icons.bolt, BugieColors.primary),
      _ChipData('Seguro', Icons.verified_user_outlined, BugieColors.primary),
      _ChipData('Cercano', Icons.favorite_border, BugieColors.primary),
      _ChipData('Claro', Icons.wb_sunny_outlined, BugieColors.primary),
      _ChipData('Ágil', Icons.rocket_launch_outlined, BugieColors.accent),
    ];

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [for (final it in items) _Chip(data: it)],
    );
  }
}

class _ChipData {
  final String label;
  final IconData icon;
  final Color color;
  const _ChipData(this.label, this.icon, this.color);
}

class _Chip extends StatelessWidget {
  final _ChipData data;
  const _Chip({required this.data});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: data.color.withOpacity(0.45)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(data.icon, size: 16, color: data.color),
          const SizedBox(width: 6),
          Text(
            data.label,
            style: TextStyle(
              color: data.color,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
