import 'package:flutter/material.dart';
import '../theme/bugie_theme.dart';

/// Reglas y formato de los viajes / envíos PROGRAMADOS.
///
/// Convención de horas del proyecto: la API devuelve y recibe hora de Perú
/// SIN zona. Aquí las horas programadas se manejan como DateTime "local" con
/// los números de la hora de Perú, sin importar la zona del celular.
class Schedule {
  static const minMinutes = 30; // mínimo de anticipación
  static const maxDays = 7;     // máximo hacia adelante

  /// Hora actual de Perú (UTC-5, sin horario de verano) con los números de Perú.
  static DateTime peruNow() {
    final u = DateTime.now().toUtc().subtract(const Duration(hours: 5));
    return DateTime(u.year, u.month, u.day, u.hour, u.minute, u.second);
  }

  /// Error de la hora elegida, o null si está bien.
  static String? validate(DateTime? at) {
    if (at == null) return 'Elige la fecha y la hora.';
    final now = peruNow();
    if (at.isBefore(now.add(const Duration(minutes: minMinutes)))) {
      return 'Programa con al menos $minMinutes minutos de anticipación.';
    }
    if (at.isAfter(now.add(const Duration(days: maxDays)))) {
      return 'Solo puedes programar hasta $maxDays días adelante.';
    }
    return null;
  }

  /// Propuesta inicial: dentro de 1 hora, redondeada a los 15 min siguientes.
  static DateTime suggestion() {
    final t = peruNow().add(const Duration(hours: 1));
    final extra = (15 - t.minute % 15) % 15;
    return DateTime(t.year, t.month, t.day, t.hour, t.minute)
        .add(Duration(minutes: extra));
  }

  /// Para la API: "AAAA-MM-DDTHH:mm:00" (hora de Perú, sin zona).
  static String toApi(DateTime at) =>
      '${at.year.toString().padLeft(4, '0')}-${_pad(at.month)}-${_pad(at.day)}'
      'T${_pad(at.hour)}:${_pad(at.minute)}:00';

  static const _days = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

  /// "sáb 04/10 · 10:30".
  static String format(DateTime at) =>
      '${_days[at.weekday - 1]} ${_pad(at.day)}/${_pad(at.month)} · ${_pad(at.hour)}:${_pad(at.minute)}';

  static String _pad(int n) => n.toString().padLeft(2, '0');
}

/// Pastilla "Programado · sáb 04/10 · 10:30".
/// Con [forLabel] = true dice "Programado para sáb 04/10 · 10:30".
class ScheduledBadge extends StatelessWidget {
  final DateTime at;
  final bool compact;
  final bool forLabel;
  const ScheduledBadge(
      {super.key, required this.at, this.compact = false, this.forLabel = false});

  @override
  Widget build(BuildContext context) {
    const color = BugieColors.primary2;
    return Container(
      padding: EdgeInsets.symmetric(
          horizontal: compact ? 7 : 10, vertical: compact ? 2 : 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.event, size: compact ? 12 : 14, color: color),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              forLabel
                  ? 'Programado para ${Schedule.format(at)}'
                  : 'Programado · ${Schedule.format(at)}',
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: compact ? 11 : 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Selector "Ahora / Programar" con fecha y hora.
/// [onChanged] recibe null para "Ahora" o la hora programada (hora de Perú).
class ScheduleSelector extends StatefulWidget {
  final ValueChanged<DateTime?> onChanged;
  /// "Te recogemos" (viaje) o "Recojo" (envío), para el texto de ayuda.
  final bool isDelivery;
  const ScheduleSelector({super.key, required this.onChanged, this.isDelivery = false});

  @override
  State<ScheduleSelector> createState() => _ScheduleSelectorState();
}

class _ScheduleSelectorState extends State<ScheduleSelector> {
  bool _scheduled = false;
  DateTime? _at;

  void _setScheduled(bool v) {
    setState(() {
      _scheduled = v;
      if (v) _at ??= Schedule.suggestion();
    });
    widget.onChanged(v ? _at : null);
  }

  Future<void> _pickDate() async {
    final now = Schedule.peruNow();
    final cur = _at ?? Schedule.suggestion();
    final d = await showDatePicker(
      context: context,
      initialDate: cur,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: Schedule.maxDays)),
      helpText: 'Fecha del recojo',
      cancelText: 'Cancelar',
      confirmText: 'Listo',
    );
    if (d == null) return;
    setState(() => _at = DateTime(d.year, d.month, d.day, cur.hour, cur.minute));
    widget.onChanged(_at);
  }

  Future<void> _pickTime() async {
    final cur = _at ?? Schedule.suggestion();
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: cur.hour, minute: cur.minute),
      helpText: 'Hora del recojo (hora de Perú)',
      cancelText: 'Cancelar',
      confirmText: 'Listo',
    );
    if (t == null) return;
    setState(() => _at = DateTime(cur.year, cur.month, cur.day, t.hour, t.minute));
    widget.onChanged(_at);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final error = _scheduled ? Schedule.validate(_at) : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('¿Cuándo?',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, icon: Icon(Icons.bolt), label: Text('Ahora')),
            ButtonSegment(value: true, icon: Icon(Icons.event), label: Text('Programar')),
          ],
          selected: {_scheduled},
          onSelectionChanged: (s) => _setScheduled(s.first),
        ),
        if (_scheduled) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _pickDate,
                  icon: const Icon(Icons.calendar_month, size: 18),
                  label: Text(_at == null
                      ? 'Fecha'
                      : '${_at!.day.toString().padLeft(2, '0')}/${_at!.month.toString().padLeft(2, '0')}/${_at!.year}'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _pickTime,
                  icon: const Icon(Icons.schedule, size: 18),
                  label: Text(_at == null
                      ? 'Hora'
                      : '${_at!.hour.toString().padLeft(2, '0')}:${_at!.minute.toString().padLeft(2, '0')}'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            error ??
                '${widget.isDelivery ? 'Recojo' : 'Te recogemos'} el ${Schedule.format(_at!)}. '
                    'Los conductores negocian desde ahora; te recordaremos 30 y 10 minutos antes.',
            style: TextStyle(
                fontSize: 12,
                color: error != null ? BugieColors.danger : c.textMuted),
          ),
        ],
      ],
    );
  }
}
