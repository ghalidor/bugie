import 'package:flutter/material.dart';

/// De quién viene un aviso (campo `from` del push):
///   'passenger' → Pasajero (Icons.person)
///   'driver'    → Conductor (Icons.badge)
///   'bugie'     → Bugie / admin (Icons.shield)
/// Misma convención de iconos que la web.
IconData fromIcon(String? from) {
  switch (from) {
    case 'passenger': return Icons.person;
    case 'driver':    return Icons.badge;
    default:          return Icons.shield; // 'bugie' / admin
  }
}

/// Texto de quién envía: "Pasajero" / "Conductor" / "Bugie".
String fromLabel(String? from) {
  switch (from) {
    case 'passenger': return 'Pasajero';
    case 'driver':    return 'Conductor';
    default:          return 'Bugie';
  }
}

/// Línea "De: Conductor" con su icono.
/// [color] por defecto toma el color de texto actual.
class FromBadge extends StatelessWidget {
  final String? from;
  final Color? color;
  final double fontSize;

  const FromBadge({
    super.key,
    required this.from,
    this.color,
    this.fontSize = 12,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? DefaultTextStyle.of(context).style.color;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(fromIcon(from), size: fontSize + 2, color: c),
        const SizedBox(width: 4),
        Text(
          'De: ${fromLabel(from)}',
          style: TextStyle(
            color: c,
            fontSize: fontSize,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
