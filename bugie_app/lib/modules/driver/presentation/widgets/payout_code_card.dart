import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/bugie_theme.dart';
import '../../../payments/domain/payment_model.dart';
import '../../../rewards/domain/rewards_model.dart';

/// Estado de un código para cobrar.
enum PayoutCodeStatus { pending, paid, expired, cancelled }

/// Código que el conductor lleva al admin para cobrar:
///   · canje de puntos (BG-...) → bono, producto o beneficio de socio.
///   · premio de sorteo (PZ-...).
class PayoutCodeItem {
  final String code;
  final bool isRaffle;
  final String title;
  final String? detail;
  final double? amount;
  final PayoutCodeStatus status;
  final DateTime? expiresAt;
  final DateTime date;

  const PayoutCodeItem({
    required this.code,
    required this.isRaffle,
    required this.title,
    required this.status,
    required this.date,
    this.detail,
    this.amount,
    this.expiresAt,
  });

  /// Arma la lista a partir de los canjes, los sorteos y los pagos recibidos.
  /// Primero los pendientes de cobro; luego el resto, del más reciente al más antiguo.
  static List<PayoutCodeItem> build({
    required List<RewardRedemption> redemptions,
    required List<UserRaffle> raffles,
    DriverPayouts? payouts,
  }) {
    final paidCodes = <String>{
      for (final p in payouts?.items ?? const <DriverPayout>[])
        if ((p.code ?? '').isNotEmpty) p.code!.toUpperCase(),
    };
    final now = DateTime.now();
    final list = <PayoutCodeItem>[];

    for (final r in redemptions.where((r) => r.isCollectible && r.code.isNotEmpty)) {
      PayoutCodeStatus status;
      if (r.status == 'used' || paidCodes.contains(r.code.toUpperCase())) {
        status = PayoutCodeStatus.paid;
      } else if (r.status == 'cancelled') {
        status = PayoutCodeStatus.cancelled;
      } else if (r.status == 'expired' || r.expiresAt.isBefore(now)) {
        status = PayoutCodeStatus.expired;
      } else {
        status = PayoutCodeStatus.pending;
      }
      list.add(PayoutCodeItem(
        code: r.code,
        isRaffle: false,
        title: 'Canje de puntos: ${r.itemName}',
        detail: '${NumberFormat.decimalPattern('es_PE').format(r.pointsSpent)} puntos',
        amount: r.amountSoles,
        status: status,
        expiresAt: r.expiresAt,
        date: r.createdAt,
      ));
    }

    for (final r in raffles.where((r) => r.iWon && (r.myPrizeCode ?? '').isNotEmpty)) {
      final puesto = r.myPrizeRank == 1 ? 'Premio principal' : 'Puesto ${r.myPrizeRank ?? '-'}';
      list.add(PayoutCodeItem(
        code: r.myPrizeCode!,
        isRaffle: true,
        title: 'Premio de sorteo: ${r.name}',
        detail: '$puesto · ${r.prizeDescription}',
        amount: r.prizeValue,
        // Cobrado si hay un pago con ese código o si el admin lo marcó entregado.
        status: r.myPrizeDelivered || paidCodes.contains(r.myPrizeCode!.toUpperCase())
            ? PayoutCodeStatus.paid
            : PayoutCodeStatus.pending,
        date: r.drawDate,
      ));
    }

    list.sort((a, b) {
      final pa = a.status == PayoutCodeStatus.pending ? 0 : 1;
      final pb = b.status == PayoutCodeStatus.pending ? 0 : 1;
      if (pa != pb) return pa - pb;
      return b.date.compareTo(a.date);
    });
    return list;
  }
}

/// Tarjeta con el código grande y copiable, qué es, monto y estado.
class PayoutCodeCard extends StatelessWidget {
  final PayoutCodeItem item;
  const PayoutCodeCard({super.key, required this.item});

  static (String, Color, IconData) _status(PayoutCodeStatus s) => switch (s) {
        PayoutCodeStatus.pending => ('Pendiente de cobro', BugieColors.warning, Icons.schedule),
        PayoutCodeStatus.paid => ('Cobrado', BugieColors.success, Icons.check_circle),
        PayoutCodeStatus.expired => ('Vencido', BugieColors.danger, Icons.event_busy),
        PayoutCodeStatus.cancelled => ('Anulado', BugieColors.danger, Icons.cancel_outlined),
      };

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final (label, color, icon) = _status(item.status);
    final pending = item.status == PayoutCodeStatus.pending;
    final fecha = DateFormat('dd MMM yyyy', 'es_PE');

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: pending ? BugieColors.primary.withValues(alpha: 0.5) : c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(item.isRaffle ? Icons.emoji_events : Icons.card_giftcard,
                  size: 18, color: BugieColors.primary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(item.title,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(icon, size: 13, color: color),
                  const SizedBox(width: 4),
                  Text(label,
                      style: TextStyle(
                          fontSize: 11, color: color, fontWeight: FontWeight.w700)),
                ]),
              ),
            ],
          ),
          if ((item.detail ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(item.detail!, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
          ],
          const SizedBox(height: 10),

          // Código grande y copiable.
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () {
              Clipboard.setData(ClipboardData(text: item.code));
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Código ${item.code} copiado')),
              );
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: BugieColors.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: BugieColors.primary.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      item.code,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 2,
                        fontFamily: 'monospace',
                        color: pending ? BugieColors.primary : c.textMuted,
                      ),
                    ),
                  ),
                  const Icon(Icons.copy, size: 18, color: BugieColors.primary),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  item.isRaffle
                      ? 'Sorteado el ${fecha.format(item.date)}'
                      : pending && item.expiresAt != null
                          ? 'Vence el ${fecha.format(item.expiresAt!)}'
                          : 'Canjeado el ${fecha.format(item.date)}',
                  style: TextStyle(fontSize: 11.5, color: c.textMuted),
                ),
              ),
              Text(
                item.amount != null && item.amount! > 0
                    ? 'S/ ${item.amount!.toStringAsFixed(2)}'
                    : 'Producto / beneficio',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
