import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../rewards/data/rewards_repository.dart';
import '../../rewards/domain/rewards_model.dart';
import '../../trips/data/trips_repository.dart';

/// Abre la hoja para elegir un cupón. Devuelve el resultado si se aplicó.
Future<CouponApplied?> showApplyCouponSheet(
  BuildContext context, {
  required String tripId,
  required double fare,
}) {
  return showModalBottomSheet<CouponApplied>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ApplyCouponSheet(tripId: tripId, fare: fare),
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Elegir un cupón para este viaje.

   Se muestran solo los cupones VIGENTES y que sirven para descontar de una
   tarifa. Los premios físicos o los bonos del conductor se entregan aparte y
   no tienen nada que hacer acá: ofrecerlos solo para que el backend los
   rechace sería hacerle perder el tiempo al pasajero.

   El descuento real lo calcula el backend, no esta pantalla. Puede aplicar
   menos de lo que vale el cupón, y en ese caso lo avisa.
   ────────────────────────────────────────────────────────────────────────── */
class _ApplyCouponSheet extends StatefulWidget {
  final String tripId;
  final double fare;
  const _ApplyCouponSheet({required this.tripId, required this.fare});

  @override
  State<_ApplyCouponSheet> createState() => _ApplyCouponSheetState();
}

class _ApplyCouponSheetState extends State<_ApplyCouponSheet> {
  /// Tipos que descuentan sobre la tarifa de un viaje.
  static const _aplicables = {'discount_amount', 'free_trip', 'discount_period'};

  List<RewardRedemption> _cupones = [];
  bool    _loading = true;
  String? _error;
  String? _aplicando;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() { _loading = true; _error = null; });
    try {
      final page = await context
          .read<RewardsRepository>()
          .getMyRedemptions(status: 'active', pageSize: 50);

      if (!mounted) return;
      setState(() {
        _cupones = page.items
            .where((c) => _aplicables.contains(c.rewardType))
            .toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _loading = false; });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudieron cargar tus cupones.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _aplicar(RewardRedemption cupon) async {
    setState(() { _aplicando = cupon.code; _error = null; });
    try {
      final r = await context
          .read<TripsRepository>()
          .applyCoupon(widget.tripId, cupon.code);

      if (!mounted) return;
      Navigator.pop(context, r);
    } on ApiException catch (e) {
      // El backend explica el motivo: vencido, de otra persona, o la función
      // todavía no está activada. Se muestra tal cual.
      if (mounted) setState(() { _error = e.message; _aplicando = null; });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudo aplicar el cupón. Inténtalo de nuevo.';
          _aplicando = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;

    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: EdgeInsets.only(
        left: 16, right: 16, top: 10,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: c.border,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),

            Row(children: [
              const Icon(Icons.local_offer_outlined, size: 20),
              const SizedBox(width: 8),
              const Text('Usar un cupón',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const Spacer(),
              Text('Tarifa S/ ${widget.fare.toStringAsFixed(2)}',
                  style: TextStyle(fontSize: 12.5, color: c.textMuted)),
            ]),
            const SizedBox(height: 12),

            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: BugieColors.danger.withOpacity(.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(children: [
                  const Icon(Icons.error_outline, size: 18, color: BugieColors.danger),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_error!, style: const TextStyle(fontSize: 12.5))),
                ]),
              ),
              const SizedBox(height: 12),
            ],

            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 30),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_cupones.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Column(children: [
                  Icon(Icons.local_offer_outlined, size: 36, color: c.textMuted),
                  const SizedBox(height: 12),
                  Text('No tienes cupones de descuento vigentes.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: c.textMuted)),
                  const SizedBox(height: 4),
                  Text('Cánjealos con tus puntos desde Mis puntos.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: c.textMuted)),
                ]),
              )
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _cupones.length,
                  itemBuilder: (_, i) => _CouponOption(
                    cupon: _cupones[i],
                    fare: widget.fare,
                    busy: _aplicando == _cupones[i].code,
                    disabled: _aplicando != null,
                    onTap: () => _aplicar(_cupones[i]),
                  ),
                ),
              ),

            const SizedBox(height: 6),
            Text(
              'El descuento se aplica al monto que le pagas al conductor. '
              'Si cancelas el viaje, el cupón vuelve a quedar disponible.',
              style: TextStyle(fontSize: 11.5, color: c.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _CouponOption extends StatelessWidget {
  final RewardRedemption cupon;
  final double fare;
  final bool busy;
  final bool disabled;
  final VoidCallback onTap;

  const _CouponOption({
    required this.cupon,
    required this.fare,
    required this.busy,
    required this.disabled,
    required this.onTap,
  });

  /// Lo que el cupón descontaría, a modo de estimación. El valor definitivo
  /// lo calcula el backend, que además puede recortarlo.
  String _estimado() {
    switch (cupon.rewardType) {
      case 'discount_amount':
        final d = (cupon.amountSoles ?? 0).clamp(0, fare);
        return 'hasta S/ ${d.toStringAsFixed(2)} menos';
      case 'free_trip':
        final d = (cupon.amountSoles ?? 0).clamp(0, fare);
        return 'hasta S/ ${d.toStringAsFixed(2)} menos';
      case 'discount_period':
        final d = fare * (cupon.percentage ?? 0) / 100;
        return 'hasta S/ ${d.toStringAsFixed(2)} menos';
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bugie;
    final dias = cupon.expiresAt.difference(DateTime.now()).inDays;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: disabled ? null : onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: BugieColors.primary.withOpacity(.12),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: const Icon(Icons.local_offer_outlined,
                    size: 19, color: BugieColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(cupon.itemName,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text(_estimado(),
                        style: const TextStyle(
                            fontSize: 12.5,
                            color: BugieColors.success,
                            fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(
                      '${cupon.code} · '
                      '${dias <= 0 ? "vence hoy" : "vence en $dias ${dias == 1 ? "día" : "días"}"}',
                      style: TextStyle(fontSize: 11, color: c.textMuted),
                    ),
                  ],
                ),
              ),
              if (busy)
                const SizedBox(width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2))
              else
                Icon(Icons.chevron_right, color: c.textMuted),
            ]),
          ),
        ),
      ),
    );
  }
}
