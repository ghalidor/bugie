import 'package:flutter/material.dart';

import '../../theme/bugie_theme.dart';
import 'motion.dart';

/// Sistema de botones de negociación (igual para pasajero y conductor):
///  - [PrimaryActionButton]: verde, grande, ancho completo. La acción principal.
///  - [SecondaryActionButton]: con borde. Acciones alternativas.
///  - [DestructiveTextButton]: contorno rojo. Rechazar / cancelar.
///
/// Todos dan feedback al tocar (se encogen un poco) y muestran un spinner
/// cuando [loading] es true, con transición animada entre estados.

/// Envoltorio que encoge levemente al presionar (feedback táctil visual).
class _PressScale extends StatefulWidget {
  final Widget child;
  final bool enabled;
  const _PressScale({required this.child, required this.enabled});

  @override
  State<_PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<_PressScale> {
  bool _down = false;

  void _set(bool v) {
    if (!widget.enabled || _down == v) return;
    setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => _set(true),
      onPointerUp: (_) => _set(false),
      onPointerCancel: (_) => _set(false),
      child: AnimatedScale(
        scale: _down ? 0.97 : 1,
        duration: motionDuration(context, 110),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}

Widget _buttonContent({
  required BuildContext context,
  required String label,
  required IconData? icon,
  required bool loading,
  required Color spinnerColor,
  required TextStyle style,
}) {
  return AnimatedSwitcher(
    duration: motionDuration(context, 200),
    transitionBuilder: (child, anim) => FadeTransition(
      opacity: anim,
      child: ScaleTransition(scale: Tween(begin: 0.9, end: 1.0).animate(anim), child: child),
    ),
    child: loading
        ? SizedBox(
            key: const ValueKey('loading'),
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2.4, color: spinnerColor),
          )
        : Row(
            key: ValueKey('l$label'),
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: style,
                ),
              ),
            ],
          ),
  );
}

/// Botón principal grande verde ("Aceptar S/ 12.00").
class PrimaryActionButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final Color color;

  const PrimaryActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.color = BugieColors.success,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    return _PressScale(
      enabled: enabled,
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: color,
            foregroundColor: Colors.white,
            disabledBackgroundColor:
                loading ? color.withValues(alpha: 0.85) : null,
            disabledForegroundColor: loading ? Colors.white : null,
            minimumSize: const Size(0, 54),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          onPressed: enabled ? onPressed : null,
          child: _buttonContent(
            context: context,
            label: label,
            icon: icon,
            loading: loading,
            spinnerColor: Colors.white,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
        ),
      ),
    );
  }
}

/// Botón secundario con borde ("Contraofertar", "Otro monto").
class SecondaryActionButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final Color? color;
  final bool expand;

  const SecondaryActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.color,
    this.expand = true,
  });

  @override
  Widget build(BuildContext context) {
    final fg = color ?? BugieColors.primary;
    final enabled = onPressed != null && !loading;
    final btn = OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: fg,
        side: BorderSide(
            color: enabled ? fg.withValues(alpha: 0.7) : context.bugie.border,
            width: 1.4),
        minimumSize: const Size(0, 46),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      onPressed: enabled ? onPressed : null,
      child: _buttonContent(
        context: context,
        label: label,
        icon: icon,
        loading: loading,
        spinnerColor: fg,
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
      ),
    );
    return _PressScale(
      enabled: enabled,
      child: expand ? SizedBox(width: double.infinity, child: btn) : btn,
    );
  }
}

/// Acción destructiva con contorno rojo ("Rechazar", "Cancelar viaje").
class DestructiveTextButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool expand;
  /// Rueda giratoria en lugar del texto mientras la acción corre.
  final bool loading;

  const DestructiveTextButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.expand = false,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    // Botón con contorno rojo (mismo estilo que "Rechazar" del conductor).
    // Alto y radio iguales a [SecondaryActionButton] para que en fila
    // ("Rechazar" + "Contraofertar") queden alineados.
    final btn = OutlinedButton(
      style: OutlinedButton.styleFrom(
        foregroundColor: BugieColors.danger,
        disabledForegroundColor: BugieColors.danger.withValues(alpha: 0.45),
        side: BorderSide(
          color: BugieColors.danger.withValues(alpha: enabled ? 0.6 : 0.3),
          width: 1.4,
        ),
        minimumSize: const Size(0, 46),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      onPressed: loading ? null : onPressed,
      child: loading
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                  strokeWidth: 2.2, color: BugieColors.danger),
            )
          : Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18),
            const SizedBox(width: 6),
          ],
          // Si no entra (pantalla angosta / letra grande), se achica un
          // poco en vez de cortarse ("Recha…").
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                label,
                maxLines: 1,
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
    return _PressScale(
      enabled: onPressed != null,
      child: expand ? SizedBox(width: double.infinity, child: btn) : btn,
    );
  }
}
