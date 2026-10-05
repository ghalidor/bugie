import 'package:flutter/material.dart';

import '../../theme/bugie_theme.dart';
import 'motion.dart';

/// Precio grande con etiqueta opcional ("Ofrece", "Tu oferta"...).
///
/// - Cuando el monto cambia, cuenta desde el valor anterior hasta el nuevo
///   (contador animado) y hace un pequeño "pop".
/// - [highlight] pinta el precio en ámbar (p. ej. si difiere de tu oferta).
/// - [strike] lo tacha (propuesta rechazada).
/// - Usa FittedBox para no desbordar en pantallas angostas o texto grande.
class PriceTag extends StatefulWidget {
  final double amount;
  final String? label;
  final double fontSize;
  final Color? color;
  final bool highlight;
  final bool strike;
  final CrossAxisAlignment alignment;

  const PriceTag({
    super.key,
    required this.amount,
    this.label,
    this.fontSize = 30,
    this.color,
    this.highlight = false,
    this.strike = false,
    this.alignment = CrossAxisAlignment.start,
  });

  @override
  State<PriceTag> createState() => _PriceTagState();
}

class _PriceTagState extends State<PriceTag> {
  late double _from = widget.amount;
  int _bump = 0;

  @override
  void didUpdateWidget(covariant PriceTag old) {
    super.didUpdateWidget(old);
    if (old.amount != widget.amount) {
      _from = old.amount;
      _bump++;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final color = widget.highlight
        ? BugieColors.warning
        : (widget.color ?? c.text);
    final dur = motionDuration(context, 600);

    final price = TweenAnimationBuilder<double>(
      key: ValueKey(_bump),
      tween: Tween(begin: _from, end: widget.amount),
      duration: dur,
      curve: Curves.easeOutCubic,
      builder: (context, v, _) => Text(
        formatSoles(v),
        maxLines: 1,
        style: TextStyle(
          fontSize: widget.fontSize,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.5,
          color: color,
          height: 1.1,
          decoration: widget.strike ? TextDecoration.lineThrough : null,
        ),
      ),
    );

    // "Pop" sutil cuando cambia el precio.
    final popped = TweenAnimationBuilder<double>(
      key: ValueKey('pop$_bump'),
      tween: Tween(begin: _bump == 0 ? 1 : 1.08, end: 1),
      duration: motionDuration(context, 350),
      curve: Curves.easeOutBack,
      builder: (context, s, child) => Transform.scale(
        scale: s,
        alignment: widget.alignment == CrossAxisAlignment.end
            ? Alignment.centerRight
            : Alignment.centerLeft,
        child: child,
      ),
      child: price,
    );

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: widget.alignment,
      children: [
        if (widget.label != null)
          Text(
            widget.label!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: c.textMuted),
          ),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: widget.alignment == CrossAxisAlignment.end
              ? Alignment.centerRight
              : Alignment.centerLeft,
          child: popped,
        ),
      ],
    );
  }
}
