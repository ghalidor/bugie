import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/bugie_theme.dart';
import 'motion.dart';

/// Contador regresivo de una solicitud / oferta.
///
/// Al llegar a cero cambia el texto a "Tiempo agotado" y llama a
/// [onExpired] (una sola vez, solo si llegó a cero mientras estaba en
/// pantalla): la pantalla recarga y muestra lo que diga el backend.
///
/// [reason] viene del backend (TripDto.expiresReason):
///  - 'proposal_confirm':  el pasajero aceptó tu propuesta → "Confirma en 12:30".
///  - 'no_driver_timeout': inmediato sin conductor → "Se cancela en 08:30".
///  - 'scheduled_time':    programado sin conductor → "Sale a las 14:00"
///                         (o "Programado: empieza en 45:10" si falta < 1 h).
/// [textBuilder] reemplaza el texto (recibe el tiempo restante "mm:ss").
class ExpiryCountdown extends StatefulWidget {
  final DateTime expiresAt;
  final String? reason;
  final VoidCallback? onExpired;
  final String Function(String clock)? textBuilder;

  const ExpiryCountdown({
    super.key,
    required this.expiresAt,
    this.reason,
    this.onExpired,
    this.textBuilder,
  });

  /// "mm:ss" (o "h:mm:ss") del tiempo que falta hasta [at].
  static String clockUntil(DateTime at) {
    final d = at.difference(DateTime.now());
    return _ExpiryCountdownState._clock(d.isNegative ? Duration.zero : d);
  }

  @override
  State<ExpiryCountdown> createState() => _ExpiryCountdownState();
}

class _ExpiryCountdownState extends State<ExpiryCountdown>
    with SingleTickerProviderStateMixin {
  Timer? _timer;
  late Duration _left = _remaining();
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1000),
  );

  Duration _remaining() {
    final d = widget.expiresAt.difference(DateTime.now());
    return d.isNegative ? Duration.zero : d;
  }

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    // Ya vencido al aparecer: no se avisa (la pantalla ya recargó y el
    // backend todavía no lo cerró; avisar otra vez sería recargar en bucle).
    if (_left == Duration.zero) return;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final left = _remaining();
      setState(() => _left = left);
      if (left == Duration.zero) {
        _timer?.cancel();
        _pulse.stop();
        widget.onExpired?.call();
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Latido suave del ícono; se apaga con "Quitar animaciones".
    if (reduceMotion(context) || _left == Duration.zero) {
      _pulse.stop();
      _pulse.value = 1;
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(covariant ExpiryCountdown old) {
    super.didUpdateWidget(old);
    if (old.expiresAt != widget.expiresAt) {
      _left = _remaining();
      _startTimer();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  static String _two(int n) => n.toString().padLeft(2, '0');

  static String _clock(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    return h > 0 ? '$h:${_two(m)}:${_two(s)}' : '${_two(m)}:${_two(s)}';
  }

  @override
  Widget build(BuildContext context) {
    final expired = _left == Duration.zero;
    final scheduled = widget.reason == 'scheduled_time';

    final String text;
    final IconData icon;
    Color color;
    if (!expired && widget.textBuilder != null) {
      text = widget.textBuilder!(_clock(_left));
      icon = Icons.timer_outlined;
      color = BugieColors.primary;
    } else if (expired) {
      text = 'Tiempo agotado';
      icon = Icons.timer_off_outlined;
      color = BugieColors.danger;
    } else if (scheduled) {
      final local = widget.expiresAt.toLocal();
      text = _left.inMinutes < 60
          ? 'Programado: empieza en ${_clock(_left)}'
          : 'Sale a las ${_two(local.hour)}:${_two(local.minute)}';
      icon = Icons.event_outlined;
      color = BugieColors.primary;
    } else if (widget.reason == 'no_driver_timeout') {
      text = 'Se cancela en ${_clock(_left)}';
      icon = Icons.timer_outlined;
      color = BugieColors.primary;
    } else {
      text = 'Confirma en ${_clock(_left)}';
      icon = Icons.timer_outlined;
      color = BugieColors.success;
    }
    // Último minuto: aviso en ámbar.
    if (!expired && _left.inSeconds < 60) color = BugieColors.warning;

    return Semantics(
      liveRegion: false,
      label: text,
      child: ExcludeSemantics(
        child: AnimatedContainer(
          duration: motionDuration(context, 250),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: color.withValues(alpha: 0.45)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              FadeTransition(
                opacity: Tween(begin: 0.45, end: 1.0).animate(_pulse),
                child: Icon(icon, size: 15, color: color),
              ),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  text,
                  maxLines: widget.textBuilder != null ? 2 : 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: color,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Chip con la calificación del pasajero. Si [rating] es null no pinta nada
/// (hoy no existe calificación de pasajeros).
class PassengerRatingChip extends StatelessWidget {
  final double? rating;
  final int? count;
  const PassengerRatingChip({super.key, required this.rating, this.count});

  @override
  Widget build(BuildContext context) {
    if (rating == null) return const SizedBox.shrink();
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFFF5B301).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.star_rounded, size: 14, color: Color(0xFFF5B301)),
          const SizedBox(width: 2),
          Text(
            rating!.toStringAsFixed(1),
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700, color: c.text),
          ),
          if ((count ?? 0) > 0) ...[
            const SizedBox(width: 3),
            Text('($count)',
                style: TextStyle(fontSize: 11.5, color: c.textMuted)),
          ],
        ],
      ),
    );
  }
}
