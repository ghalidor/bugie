import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../payments/data/payments_repository.dart';
import '../../payments/domain/payment_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';

class EarningsScreen extends StatefulWidget {
  const EarningsScreen({super.key});

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  DriverEarnings? _earnings;
  /// Pagos que Bugie le hizo (bonos, premios). Null = no se pudo cargar.
  DriverPayouts? _payouts;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final repo = context.read<PaymentsRepository>();
      final e = await repo.getEarnings();
      DriverPayouts? p;
      try {
        p = await repo.getMyPayouts();
      } catch (_) {
        p = null; // no bloquea la pantalla de ganancias
      }
      if (mounted) setState(() { _earnings = e; _payouts = p; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'No se pudo cargar.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Mis ganancias'),
      body: SafeArea(
        child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: BugieColors.danger)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                    children: [
                      // Total este mes (gigante)
                      Card(
                        color: BugieColors.primary,
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            children: [
                              const Text('Ganancias este mes',
                                  style: TextStyle(color: Colors.white70)),
                              const SizedBox(height: 4),
                              Text(
                                'S/ ${_earnings!.earningsThisMonth.toStringAsFixed(2)}',
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 36,
                                    fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      Row(
                        children: [
                          Expanded(
                            child: BugieCard(
                              child: Column(
                                children: [
                                  const Text('Total histórico',
                                      style: TextStyle(color: BugieColors.textMuted, fontSize: 12)),
                                  const SizedBox(height: 4),
                                  Text(
                                      'S/ ${_earnings!.totalEarnings.toStringAsFixed(2)}',
                                      style: const TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.bold)),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: BugieCard(
                              child: Column(
                                children: [
                                  const Text('Viajes totales',
                                      style: TextStyle(color: BugieColors.textMuted, fontSize: 12)),
                                  const SizedBox(height: 4),
                                  Text('${_earnings!.totalTrips}',
                                      style: const TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.bold)),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),

                      // Pagos recibidos de Bugie (bonos canjeados, premios)
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          const Expanded(
                            child: Text('Pagos recibidos de Bugie',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                          ),
                          if (_payouts != null && _payouts!.items.isNotEmpty)
                            Text('S/ ${_payouts!.totalAmount.toStringAsFixed(2)}',
                                style: const TextStyle(fontWeight: FontWeight.bold)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (_payouts == null)
                        const Text('No se pudieron cargar los pagos.',
                            style: TextStyle(color: BugieColors.textMuted))
                      else if (_payouts!.items.isEmpty)
                        const Text(
                          'Aún no recibiste pagos. Aquí verás los bonos que canjees '
                          'con tus puntos y los premios de sorteos.',
                          style: TextStyle(color: BugieColors.textMuted),
                        )
                      else
                        ..._payouts!.items.map((p) => BugieCard(
                              child: ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: Icon(
                                  p.method == 'efectivo'
                                      ? Icons.payments_outlined
                                      : p.method == 'transferencia'
                                          ? Icons.account_balance_outlined
                                          : Icons.phone_android,
                                  color: BugieColors.primary,
                                ),
                                title: Text(p.sourceLabel),
                                subtitle: Text([
                                  p.methodLabel,
                                  if (p.operationNumber != null) 'op ${p.operationNumber}',
                                  if (p.paidAt != null)
                                    DateFormat('dd MMM yyyy, HH:mm', 'es_PE').format(p.paidAt!),
                                  if (p.note != null) p.note!,
                                ].join(' · ')),
                                trailing: Text('S/ ${p.amount.toStringAsFixed(2)}',
                                    style: const TextStyle(fontWeight: FontWeight.bold)),
                              ),
                            )),
                    ],
                  ),
                ),
      ),
    );
  }
}
