import 'package:flutter/material.dart';

import '../theme/bugie_theme.dart';

/// Estado vacío amable: ícono en círculo, título corto y una línea de ayuda.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? message;
  final Color color;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.color = BugieColors.primary,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 36, color: color),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: c.text,
            ),
          ),
          if (message != null) ...[
            const SizedBox(height: 6),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, height: 1.35, color: c.textMuted),
            ),
          ],
        ],
      ),
    );
  }
}

/// Nota informativa discreta (ícono "i" + texto) para explicar una regla.
class InfoNote extends StatelessWidget {
  final String text;
  final IconData icon;
  const InfoNote({super.key, required this.text, this.icon = Icons.info_outline});

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: BugieColors.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 13, height: 1.35, color: c.textMuted),
            ),
          ),
        ],
      ),
    );
  }
}
