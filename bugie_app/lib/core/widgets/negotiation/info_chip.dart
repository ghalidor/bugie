import 'package:flutter/material.dart';

import '../../theme/bugie_theme.dart';
import 'motion.dart';

/// Chip informativo (distancia, "a 4 min", forma de pago, Envío...).
/// Para agruparlos usa `Wrap` (bajan de línea en pantallas angostas).
class InfoChip extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color? color;

  const InfoChip({
    super.key,
    required this.icon,
    required this.text,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final fg = color ?? c.text;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: (color ?? c.textMuted).withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: (color ?? c.border).withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color ?? c.textMuted),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 12.5, fontWeight: FontWeight.w600, color: fg),
            ),
          ),
        ],
      ),
    );
  }
}

/// Badge "Nuevo" con un latido suave (solo mientras [visible] es true).
class NewBadge extends StatefulWidget {
  final String text;
  const NewBadge({super.key, this.text = 'Nuevo'});

  @override
  State<NewBadge> createState() => _NewBadgeState();
}

class _NewBadgeState extends State<NewBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );
  late final Animation<double> _scale = Tween(begin: 1.0, end: 1.08)
      .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reduceMotion(context)) {
      _ctrl.stop();
      _ctrl.value = 0;
    } else if (!_ctrl.isAnimating) {
      _ctrl.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [BugieColors.primary, BugieColors.accent]),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          widget.text,
          style: const TextStyle(
              color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}

/// Tipos de estado de negociación, con su color e ícono.
enum NegotiationState { sending, waiting, counter, accepted, rejected, expired }

/// Aviso de estado de la negociación ("Propuesta enviada", "Aceptada"...).
/// Cambia con animación cuando cambia el estado.
class NegotiationStatusBanner extends StatelessWidget {
  final NegotiationState state;
  final String title;
  final String? message;
  final Widget? trailing;

  const NegotiationStatusBanner({
    super.key,
    required this.state,
    required this.title,
    this.message,
    this.trailing,
  });

  static (Color, IconData) styleFor(NegotiationState s) => switch (s) {
        NegotiationState.sending => (BugieColors.primary, Icons.send_rounded),
        NegotiationState.waiting =>
          (BugieColors.primary, Icons.hourglass_top_rounded),
        NegotiationState.counter => (BugieColors.warning, Icons.swap_horiz),
        NegotiationState.accepted =>
          (BugieColors.success, Icons.check_circle_rounded),
        NegotiationState.rejected => (BugieColors.danger, Icons.block),
        NegotiationState.expired =>
          (BugieColors.statusSuperseded, Icons.timer_off_outlined),
      };

  @override
  Widget build(BuildContext context) {
    final (color, icon) = styleFor(state);
    final c = context.bugie;
    return AnimatedSwitcher(
      duration: motionDuration(context, 280),
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SizeTransition(sizeFactor: anim, axisAlignment: -1, child: child),
      ),
      child: Container(
        key: ValueKey('$state$title'),
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.45)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            state == NegotiationState.sending
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2.4, color: color))
                : Icon(icon, color: color, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14.5,
                          color: color)),
                  if (message != null) ...[
                    const SizedBox(height: 3),
                    Text(message!,
                        style: TextStyle(fontSize: 12.5, color: c.textMuted)),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}
