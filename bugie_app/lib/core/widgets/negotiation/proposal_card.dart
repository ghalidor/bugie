import 'package:flutter/material.dart';

import '../../theme/bugie_theme.dart';
import 'price_tag.dart';

/// Tarjeta de una oferta en la negociación (la usa el pasajero para cada
/// conductor, y puede reutilizarse en cualquier lista de ofertas).
///
/// Solo pinta: los datos y las acciones las pasa quien la usa.
///  - Cabecera: [avatar] + nombre + vehículo/placa + calificación + [topRight].
///  - Fila de precio: chips de [meta] a la izquierda y PRECIO a la derecha
///    (ámbar si difiere de [referenceFare]).
///  - [footer]: botones (Aceptar / Contraofertar / Rechazar...).
class ProposalCard extends StatelessWidget {
  final Widget avatar;
  final String name;
  final Widget? nameLeading;
  final String? subtitle;
  final String? plate;
  final double? rating;
  /// Cantidad de calificaciones (se muestra "(N)" junto a [rating]).
  final int? ratingCount;
  /// Si no hay [rating], muestra un "Nuevo" discreto.
  final bool showNewWhenNoRating;
  final double fare;
  final double? referenceFare;
  final double? previousFare;
  final bool strike;
  final Color? borderColor;
  final Widget? topRight;
  final List<Widget> meta;
  final Widget? footer;

  const ProposalCard({
    super.key,
    required this.avatar,
    required this.name,
    required this.fare,
    this.nameLeading,
    this.subtitle,
    this.plate,
    this.rating,
    this.ratingCount,
    this.showNewWhenNoRating = false,
    this.referenceFare,
    this.previousFare,
    this.strike = false,
    this.borderColor,
    this.topRight,
    this.meta = const [],
    this.footer,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final differs = referenceFare != null &&
        (fare - referenceFare!).abs() >= 0.01 &&
        !strike;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: borderColor ?? c.border,
          width: borderColor == null ? 1 : 1.4,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              avatar,
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (nameLeading != null) ...[
                          nameLeading!,
                          const SizedBox(width: 4),
                        ],
                        Flexible(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 15.5,
                                color: c.text),
                          ),
                        ),
                      ],
                    ),
                    if ((subtitle ?? '').isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: c.textMuted),
                      ),
                    ],
                    if (plate != null ||
                        rating != null ||
                        showNewWhenNoRating) ...[
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (rating != null)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.star_rounded,
                                    size: 15, color: Color(0xFFF5B301)),
                                const SizedBox(width: 2),
                                Text(rating!.toStringAsFixed(1),
                                    style: TextStyle(
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w700,
                                        color: c.text)),
                                if ((ratingCount ?? 0) > 0) ...[
                                  const SizedBox(width: 3),
                                  Text('($ratingCount)',
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: c.textMuted)),
                                ],
                              ],
                            )
                          else if (showNewWhenNoRating)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 7, vertical: 1),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: c.border),
                              ),
                              child: Text('Nuevo',
                                  style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: c.textMuted)),
                            ),
                          if (plate != null)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: c.textMuted.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                plate!,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.6,
                                  color: c.text,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              if (topRight != null) topRight!,
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: meta,
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    PriceTag(
                      amount: fare,
                      fontSize: 26,
                      highlight: differs,
                      color: strike ? BugieColors.danger : null,
                      strike: strike,
                      alignment: CrossAxisAlignment.end,
                    ),
                    if (previousFare != null)
                      Text(
                        'antes S/ ${previousFare!.toStringAsFixed(2)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: c.textMuted,
                          decoration: TextDecoration.lineThrough,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          if (footer != null) ...[
            const SizedBox(height: 12),
            footer!,
          ],
        ],
      ),
    );
  }
}
