import 'package:flutter/material.dart';

import '../../theme/bugie_theme.dart';
import 'action_buttons.dart';
import 'motion.dart';

/// Calcula los montos rápidos de contraoferta: [base] + cada salto de
/// [deltas] (p. ej. [1, 2, 3] o [-1, 1, 2]). Sin redondeos ni topes: la
/// validación del monto la hace el backend, igual que con "Otro monto".
/// Solo se omiten montos de 0 o menos. Ordenados de menor a mayor.
List<double> quickFares({
  required double base,
  required List<double> deltas,
}) {
  final out = <double>{};
  for (final d in deltas) {
    // Solo normaliza a céntimos (evita 8.299999 por la suma en double).
    final v = double.parse((base + d).toStringAsFixed(2));
    if (v <= 0) continue;
    out.add(v);
  }
  final list = out.toList()..sort();
  return list;
}

/// Confirmación breve antes de enviar un monto rápido.
/// Devuelve true si el usuario confirma.
Future<bool> confirmQuickFare(
  BuildContext context, {
  required double fare,
  required String recipient,
}) async {
  // "a el pasajero" → "al pasajero" (contracción obligatoria).
  final to = recipient.startsWith('el ')
      ? 'al ${recipient.substring(3)}'
      : 'a $recipient';
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('¿Enviar ${formatSoles(fare)}?'),
      content: Text('Le enviaremos esta oferta $to.'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('No'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: BugieColors.success),
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Sí, enviar'),
        ),
      ],
    ),
  );
  return ok == true;
}

/// Chips de precio rápido + chip "Otro monto".
///
/// Si hay espacio, los montos van en una fila de botones del MISMO ancho y
/// "Otro monto" ocupa la fila de abajo a lo ancho (todo alineado, nada
/// suelto). En pantallas muy angostas o con letra grande vuelve a un Wrap.
class FareChips extends StatelessWidget {
  final List<double> fares;
  final double? referenceFare;
  final ValueChanged<double> onSelected;
  final VoidCallback? onOther;
  final bool enabled;

  const FareChips({
    super.key,
    required this.fares,
    required this.onSelected,
    this.referenceFare,
    this.onOther,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    Widget fareChip(int i, {bool stacked = false}) => _AppearIn(
          index: i,
          child: _FareChip(
            label: formatSoles(fares[i]),
            sub: referenceFare == null
                ? null
                : _diffLabel(fares[i] - referenceFare!),
            stacked: stacked,
            onTap: enabled ? () => onSelected(fares[i]) : null,
          ),
        );
    final other = onOther == null
        ? null
        : _AppearIn(
            index: fares.length,
            child: _FareChip(
              label: 'Otro monto',
              icon: Icons.edit_outlined,
              outlined: true,
              onTap: enabled ? onOther : null,
            ),
          );

    return LayoutBuilder(builder: (context, box) {
      final scale = MediaQuery.textScalerOf(context).scale(1);
      final n = fares.length;
      final cell = n == 0 ? 0 : (box.maxWidth - 8 * (n - 1)) / n;
      final fitsGrid = n > 0 && n <= 4 && cell >= 84 * scale;
      if (!fitsGrid) {
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (var i = 0; i < n; i++) fareChip(i),
            if (other != null) other,
          ],
        );
      }
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (var i = 0; i < n; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(child: fareChip(i, stacked: true)),
              ],
            ],
          ),
          if (other != null) ...[
            const SizedBox(height: 8),
            other,
          ],
        ],
      );
    });
  }

  static String _diffLabel(double d) {
    final s = d.abs().toStringAsFixed(d.abs() % 1 == 0 ? 0 : 2);
    return d >= 0 ? '+$s' : '-$s';
  }
}

class _AppearIn extends StatelessWidget {
  final int index;
  final Widget child;
  const _AppearIn({required this.index, required this.child});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: motionDuration(context, 260 + index * 70),
      curve: Curves.easeOutBack,
      builder: (context, v, child) => Opacity(
        opacity: v.clamp(0.0, 1.0),
        child: Transform.scale(scale: 0.85 + 0.15 * v, child: child),
      ),
      child: child,
    );
  }
}

class _FareChip extends StatelessWidget {
  final String label;
  final String? sub;
  final IconData? icon;
  final bool outlined;
  /// Monto arriba y diferencia (+1) abajo, centrados (modo grilla).
  final bool stacked;
  final VoidCallback? onTap;

  const _FareChip({
    required this.label,
    this.sub,
    this.icon,
    this.outlined = false,
    this.stacked = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final color = outlined ? c.textMuted : BugieColors.primary;
    return Opacity(
      opacity: onTap == null ? 0.5 : 1,
      child: Material(
        color: outlined
            ? Colors.transparent
            : BugieColors.primary.withValues(alpha: 0.10),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
              color: outlined ? c.border : BugieColors.primary.withValues(alpha: 0.45)),
        ),
        child: InkWell(
          customBorder: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14)),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: stacked ? 56 : 48),
            child: Padding(
              padding: EdgeInsets.symmetric(
                  horizontal: stacked ? 8 : 16, vertical: 8),
              child: stacked
                  ? Column(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            label,
                            maxLines: 1,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: BugieColors.primary,
                            ),
                          ),
                        ),
                        if (sub != null)
                          Text(
                            sub!,
                            maxLines: 1,
                            style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                color: c.textMuted),
                          ),
                      ],
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (icon != null) ...[
                          Icon(icon, size: 18, color: color),
                          const SizedBox(width: 8),
                        ],
                        Flexible(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: outlined ? c.text : BugieColors.primary,
                            ),
                          ),
                        ),
                        if (sub != null) ...[
                          const SizedBox(width: 6),
                          Text(sub!,
                              style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: c.textMuted)),
                        ],
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Campo "Otro monto": TextField con prefijo S/ + Enviar + Cancelar.
/// Usa el controller y callbacks que le pasen (no hace llamadas por sí solo).
class FareInputPanel extends StatelessWidget {
  final TextEditingController controller;
  final String title;
  final String? hint;
  final String? helper;
  final bool loading;
  final VoidCallback onSubmit;
  final VoidCallback onCancel;

  const FareInputPanel({
    super.key,
    required this.controller,
    required this.onSubmit,
    required this.onCancel,
    this.title = 'Otro monto',
    this.hint,
    this.helper,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title,
              style: TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w700, color: c.text)),
          const SizedBox(height: 8),
          TextField(
            controller: controller,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.send,
            onSubmitted: (_) => loading ? null : onSubmit(),
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            decoration: InputDecoration(
              prefixText: 'S/ ',
              hintText: hint,
              helperText: helper,
              helperMaxLines: 2,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
          const SizedBox(height: 10),
          PrimaryActionButton(
            label: 'Enviar oferta',
            icon: Icons.send_rounded,
            loading: loading,
            color: BugieColors.primary,
            onPressed: onSubmit,
          ),
          const SizedBox(height: 4),
          Center(
            child: TextButton(
              onPressed: loading ? null : onCancel,
              child: Text('Cancelar', style: TextStyle(color: c.textMuted)),
            ),
          ),
        ],
      ),
    );
  }
}
