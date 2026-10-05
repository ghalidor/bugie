import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../../core/widgets/bugie_card.dart';
import '../../payments/data/payments_repository.dart';
import '../../payments/domain/payment_model.dart';
import '../../rewards/data/rewards_repository.dart';
import '../../../core/widgets/bugie_internal_header.dart';
import 'widgets/payout_code_card.dart';

class EarningsScreen extends StatefulWidget {
  /// false = pestaña del menú inferior (sin botón volver).
  final bool showBack;
  const EarningsScreen({super.key, this.showBack = true});

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  DriverEarnings? _earnings;
  /// Pagos que Bugie le hizo (bonos, premios). Null = no se pudo cargar.
  DriverPayouts? _payouts;
  /// Billetera: comision que le debe a Bugie. Null = no se pudo cargar.
  DriverWallet? _wallet;
  /// Códigos para cobrar donde el admin (canjes BG-… y premios PZ-…).
  /// Null = no se pudieron cargar.
  List<PayoutCodeItem>? _codes;
  bool _loadingMore = false;
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
      final rewards = context.read<RewardsRepository>();
      final e = await repo.getEarnings();
      DriverPayouts? p;
      try {
        p = await repo.getMyPayouts();
      } catch (_) {
        p = null; // no bloquea la pantalla de ganancias
      }
      DriverWallet? w;
      try {
        w = await repo.getMyWallet();
      } catch (_) {
        w = null; // tampoco bloquea
      }
      List<PayoutCodeItem>? codes;
      try {
        final redemptions = await rewards.getMyRedemptions(pageSize: 100);
        final raffles = await rewards.getRaffles();
        codes = PayoutCodeItem.build(
          redemptions: redemptions.items,
          raffles: raffles,
          payouts: p,
        );
      } catch (_) {
        codes = null; // tampoco bloquea
      }
      if (mounted) {
        setState(() {
          _earnings = e; _payouts = p; _wallet = w; _codes = codes; _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'No se pudo cargar.'; });
    }
  }

  /// Siguiente pagina de movimientos de la billetera.
  Future<void> _loadMoreMovements() async {
    final w = _wallet;
    if (w == null || _loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final next = await context.read<PaymentsRepository>()
          .getMyWallet(page: w.page + 1, pageSize: w.pageSize);
      if (mounted) {
        setState(() => _wallet = DriverWallet(
              totalEarned: next.totalEarned,
              totalCommission: next.totalCommission,
              totalCommissionPaid: next.totalCommissionPaid,
              pendingDebt: next.pendingDebt,
              currentFeePercent: next.currentFeePercent,
              movements: [...w.movements, ...next.movements],
              total: next.total,
              page: next.page,
              pageSize: next.pageSize,
            ));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No se pudieron cargar más movimientos.')));
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  /// Seccion "Mi billetera": deuda de comision con Bugie y movimientos.
  List<Widget> _walletSection() {
    final w = _wallet;
    final fecha = DateFormat('dd MMM yyyy, HH:mm', 'es_PE');
    if (w == null) {
      return const [
        Text('Mi billetera', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        SizedBox(height: 8),
        Text('No se pudo cargar tu billetera.', style: TextStyle(color: BugieColors.textMuted)),
      ];
    }
    final debe = w.pendingDebt > 0;
    return [
      const Text('Mi billetera', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      BugieCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(debe ? 'Comisión pendiente de pago' : 'Estás al día con Bugie',
                style: const TextStyle(color: BugieColors.textMuted, fontSize: 12)),
            const SizedBox(height: 4),
            Text('S/ ${w.pendingDebt.toStringAsFixed(2)}',
                style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                    color: debe ? BugieColors.danger : BugieColors.primary)),
            const SizedBox(height: 8),
            Text(
              'Cobras todo en mano. Por cada viaje Bugie cobra una comisión '
              '(${w.currentFeePercent.toStringAsFixed(w.currentFeePercent % 1 == 0 ? 0 : 2)}%) '
              'que le pagas por Yape, Plin, transferencia o efectivo.',
              style: const TextStyle(color: BugieColors.textMuted, fontSize: 12),
            ),
            const Divider(height: 20),
            _walletRow('Ganancia neta', w.totalEarned),
            _walletRow('Comisión generada', w.totalCommission),
            _walletRow('Comisión pagada', w.totalCommissionPaid),
          ],
        ),
      ),
      const SizedBox(height: 8),
      if (w.movements.isEmpty)
        const Text('Aún no tienes movimientos.', style: TextStyle(color: BugieColors.textMuted))
      else
        ...w.movements.map((m) => BugieCard(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  m.isCommission ? Icons.receipt_long_outlined : Icons.check_circle_outline,
                  color: m.isCommission ? BugieColors.danger : BugieColors.primary,
                ),
                title: Text(m.isCommission ? 'Comisión de viaje' : 'Pago de comisión'),
                subtitle: Text([
                  if (m.isCommission && m.tripAmount != null)
                    'Viaje S/ ${m.tripAmount!.toStringAsFixed(2)}',
                  if (!m.isCommission) m.methodLabel,
                  if (m.operationNumber != null) 'op ${m.operationNumber}',
                  fecha.format(m.paidAt ?? m.createdAt),
                  if (m.note != null) m.note!,
                ].join(' · ')),
                trailing: Text(
                  '${m.isCommission ? '-' : '+'} S/ ${m.amount.toStringAsFixed(2)}',
                  style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: m.isCommission ? BugieColors.danger : BugieColors.primary),
                ),
              ),
            )),
      if (w.hasMore)
        TextButton(
          onPressed: _loadingMore ? null : _loadMoreMovements,
          child: _loadingMore
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Ver más movimientos'),
        ),
    ];
  }

  /// Seccion "Mis códigos para cobrar": lo que el conductor lleva al admin.
  List<Widget> _codesSection() {
    final codes = _codes;
    final pendientes = codes?.where((x) => x.status == PayoutCodeStatus.pending).length ?? 0;
    return [
      Row(
        children: [
          const Expanded(
            child: Text('Mis códigos para cobrar',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          ),
          if (pendientes > 0)
            Text('$pendientes pendiente${pendientes == 1 ? '' : 's'}',
                style: const TextStyle(
                    fontWeight: FontWeight.bold, color: BugieColors.warning)),
        ],
      ),
      const SizedBox(height: 4),
      const Text(
        'Muestra o dicta el código al administrador de Bugie para cobrar tu bono '
        'o premio. Toca el código para copiarlo.',
        style: TextStyle(color: BugieColors.textMuted, fontSize: 12),
      ),
      const SizedBox(height: 8),
      if (codes == null)
        const Text('No se pudieron cargar tus códigos.',
            style: TextStyle(color: BugieColors.textMuted))
      else if (codes.isEmpty)
        const Text(
          'Aún no tienes códigos. Cuando canjees un bono con tus puntos o ganes '
          'un sorteo, aquí verás el código para cobrarlo.',
          style: TextStyle(color: BugieColors.textMuted),
        )
      else
        ...codes.map((x) => PayoutCodeCard(item: x)),
    ];
  }

  Widget _walletRow(String label, double value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(color: BugieColors.textMuted))),
            Text('S/ ${value.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BugieInternalHeader(
        title: 'Mis ganancias',
        showBack: widget.showBack,
        leadingIcon:
            widget.showBack ? null : Icons.account_balance_wallet_outlined,
      ),
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

                      // Mi billetera: comision que le debe a Bugie
                      const SizedBox(height: 20),
                      ..._walletSection(),

                      // Mis códigos para cobrar (canjes y premios de sorteo)
                      const SizedBox(height: 20),
                      ..._codesSection(),

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
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    // Código del pago (BG-…, PZ-… o PAG-…).
                                    if ((p.code ?? '').isNotEmpty)
                                      Text('Código: ${p.code}',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontFamily: 'monospace',
                                              color: BugieColors.primary)),
                                    Text([
                                      p.methodLabel,
                                      if (p.operationNumber != null) 'op ${p.operationNumber}',
                                      if (p.paidAt != null)
                                        DateFormat('dd MMM yyyy, HH:mm', 'es_PE').format(p.paidAt!),
                                      if (p.note != null) p.note!,
                                    ].join(' · ')),
                                  ],
                                ),
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
