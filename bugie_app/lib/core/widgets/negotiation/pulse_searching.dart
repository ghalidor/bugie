import 'package:flutter/material.dart';

import '../../theme/bugie_theme.dart';
import 'motion.dart';

/// Indicador "Buscando conductores…" con ondas de radar suaves.
/// Si el usuario desactivó las animaciones, se muestra estático.
class PulseSearching extends StatefulWidget {
  final String text;
  final String? subtitle;
  final Color color;
  final IconData icon;

  const PulseSearching({
    super.key,
    required this.text,
    this.subtitle,
    this.color = BugieColors.primary,
    this.icon = Icons.local_taxi_rounded,
  });

  @override
  State<PulseSearching> createState() => _PulseSearchingState();
}

class _PulseSearchingState extends State<PulseSearching>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      _ctrl.stop();
      _ctrl.value = 0.35;
    } else if (!_ctrl.isAnimating) {
      _ctrl.repeat();
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: widget.color.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: widget.color.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 56,
            height: 56,
            child: AnimatedBuilder(
              animation: _ctrl,
              builder: (context, _) => CustomPaint(
                painter: _RadarPainter(progress: _ctrl.value, color: widget.color),
                child: Center(
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: widget.color,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(widget.icon, size: 17, color: Colors.white),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(widget.text,
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: c.text)),
                if (widget.subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(widget.subtitle!,
                      style: TextStyle(fontSize: 12.5, color: c.textMuted)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RadarPainter extends CustomPainter {
  final double progress;
  final Color color;
  _RadarPainter({required this.progress, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final maxR = size.shortestSide / 2;
    // Dos ondas desfasadas.
    for (final offset in [0.0, 0.5]) {
      final t = (progress + offset) % 1.0;
      final paint = Paint()
        ..color = color.withValues(alpha: (1 - t) * 0.35)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(center, maxR * (0.45 + 0.55 * t), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _RadarPainter old) =>
      old.progress != progress || old.color != color;
}
