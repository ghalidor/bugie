/// Formatos de texto únicos para toda la app (montos, porcentajes y
/// tiempo relativo). Los textos que ya vienen armados del servidor no pasan
/// por aquí.
library;

import 'package:intl/intl.dart';

/// Espacio no separable: "S/" y el número nunca quedan en líneas distintas.
const String _nbsp = ' ';

/// Miles con coma y 2 decimales con punto (igual que el servidor y la web).
final NumberFormat _soles = NumberFormat('#,##0.00', 'en_US');

/// Monto en soles: "S/ 1,250.00" (sin punto tras la S, 2 decimales con punto).
String formatSoles(double v) => 'S/$_nbsp${_soles.format(v)}';

/// Porcentaje sin espacio: "10%", "12.5%".
String formatPercent(double v) =>
    '${v % 1 == 0 ? v.toInt().toString() : v.toString()}%';

/// Tiempo relativo corto: "ahora", "hace 12s", "hace 5 min", "hace 2 h",
/// "hace 3 d".
///
/// Si la fecha es futura o de hace menos de 5 s (el reloj del celular puede
/// ir un poco atrasado respecto al del servidor) se muestra "ahora".
String timeAgo(DateTime d) {
  final diff = DateTime.now().difference(d);
  if (diff.inSeconds < 5) return 'ahora';
  if (diff.inSeconds < 60) return 'hace ${diff.inSeconds}s';
  if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
  if (diff.inHours < 24) return 'hace ${diff.inHours} h';
  return 'hace ${diff.inDays} d';
}

/// Días de calendario desde hoy hasta [d] (sin mirar la hora): del 10 oct al
/// 3 nov son 24, sea la hora que sea. 0 = hoy, 1 = mañana, negativo = ya pasó.
/// Así la app y la web muestran el mismo número.
int calendarDaysUntil(DateTime d) {
  final l = d.toLocal(), n = DateTime.now();
  return DateTime.utc(l.year, l.month, l.day)
      .difference(DateTime.utc(n.year, n.month, n.day))
      .inDays;
}
