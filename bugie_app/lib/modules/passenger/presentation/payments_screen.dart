import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/theme/bugie_theme.dart';
import '../../payments/data/payments_repository.dart';
import '../../payments/domain/payment_model.dart';
import '../../../core/widgets/bugie_internal_header.dart';

/// Historial de pagos del pasajero.
/// GET /api/payments/my-payments → lista de Payment.
class PassengerPaymentsScreen extends StatefulWidget {
  const PassengerPaymentsScreen({super.key});

  @override
  State<PassengerPaymentsScreen> createState() =>
      _PassengerPaymentsScreenState();
}

class _PassengerPaymentsScreenState extends State<PassengerPaymentsScreen> {
  /// Todos los pagos del backend. Hay un filtro local que toma solo los del
  /// mes actual — la regla pedida por el cliente es "mostrar solo este mes".
  List<Payment> _payments = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final list = await context.read<PaymentsRepository>().getMyPayments();
      if (!mounted) return;
      setState(() {
        _payments = list;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'No se pudieron cargar los pagos.';
          _loading = false;
        });
      }
    }
  }

  /// Pagos del mes en curso. Filtra por año + mes contra DateTime.now().
  /// Solo cuenta los completados para el total, los demás (pending/failed)
  /// no se suman pero se siguen mostrando en la lista por transparencia.
  List<Payment> get _paymentsThisMonth {
    final now = DateTime.now();
    return _payments.where((p) =>
        p.createdAt.year == now.year &&
        p.createdAt.month == now.month).toList();
  }

  /// Suma de los montos completados del mes en curso.
  double get _totalThisMonth {
    return _paymentsThisMonth
        .where((p) => p.status == PaymentStatus.completed)
        .fold(0.0, (sum, p) => sum + p.amount);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BugieInternalHeader(title: 'Mis pagos'),
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }

    final monthPayments = _paymentsThisMonth;
    if (monthPayments.isEmpty) {
      return _EmptyView(onRefresh: _load);
    }

    final monthName = DateFormat('MMMM yyyy', 'es_PE').format(DateTime.now());

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
        children: [
          // ── Banner informativo + total del mes ──
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [BugieColors.primary, Color(0xFF1E40AF)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.info_outline, color: Colors.white, size: 16),
                    SizedBox(width: 6),
                    Text(
                      'Solo se muestran los pagos del mes actual',
                      style: TextStyle(color: Colors.white, fontSize: 12),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Text(
                  monthName[0].toUpperCase() + monthName.substring(1),
                  style: const TextStyle(
                      color: Colors.white70, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  'Total gastado: S/ ${_totalThisMonth.toStringAsFixed(2)}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // ── Lista de pagos del mes ──
          ...monthPayments.map((p) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _PaymentCard(payment: p),
              )),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Card de un pago
// ─────────────────────────────────────────────────────────────────────────

class _PaymentCard extends StatelessWidget {
  final Payment payment;
  const _PaymentCard({required this.payment});

  IconData _iconFor(String method) {
    switch (method) {
      case 'yape': return Icons.smartphone;
      case 'plin': return Icons.smartphone;
      case 'cash': return Icons.payments;
      default:     return Icons.account_balance_wallet;
    }
  }

  String _methodLabel(String m) {
    switch (m) {
      case 'cash': return 'Efectivo';
      case 'yape': return 'Yape';
      case 'plin': return 'Plin';
      default:     return m.toUpperCase();
    }
  }

  Color _statusColor(String s) {
    switch (s) {
      case PaymentStatus.completed: return BugieColors.success;
      case PaymentStatus.pending:   return Colors.orange;
      case PaymentStatus.failed:    return BugieColors.danger;
      case PaymentStatus.refunded:  return BugieColors.textMuted;
      default:                      return BugieColors.textMuted;
    }
  }

  IconData _statusIcon(String s) {
    switch (s) {
      case PaymentStatus.completed: return Icons.check_circle;
      case PaymentStatus.pending:   return Icons.access_time;
      case PaymentStatus.failed:    return Icons.cancel;
      case PaymentStatus.refunded:  return Icons.undo;
      default:                      return Icons.help_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = payment;
    final color = _statusColor(p.status);
    final dateStr =
        DateFormat('dd MMM yyyy, HH:mm', 'es_PE').format(p.createdAt);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: BugieColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BugieColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 4,
            offset: Offset(0, 1),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Fila superior: ícono + método + badge estado
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: BugieColors.primary.withOpacity(0.1),
                child: Icon(_iconFor(p.method),
                    color: BugieColors.primary, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_methodLabel(p.method),
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 14)),
                    Text(dateStr,
                        style: const TextStyle(
                            fontSize: 11, color: BugieColors.textMuted)),
                  ],
                ),
              ),
              // Badge de estado
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: color.withOpacity(0.4)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_statusIcon(p.status), size: 12, color: color),
                    const SizedBox(width: 4),
                    Text(
                      PaymentStatus.label(p.status),
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: color),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Monto destacado
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                'S/ ${p.amount.toStringAsFixed(2)}',
                style: const TextStyle(
                    fontSize: 22, fontWeight: FontWeight.bold),
              ),
              const Spacer(),
              if (p.paidAt != null)
                Text(
                  'Pagado: ${DateFormat('dd/MM HH:mm', 'es_PE').format(p.paidAt!)}',
                  style: const TextStyle(
                      fontSize: 11, color: BugieColors.textMuted),
                ),
            ],
          ),

          if (p.reference != null && p.reference!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(Icons.confirmation_number_outlined,
                    size: 12, color: BugieColors.textMuted),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    'Ref: ${p.reference}',
                    style: const TextStyle(
                        fontSize: 11, color: BugieColors.textMuted),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Empty state — se muestra cuando la respuesta es OK pero no hay pagos
// ─────────────────────────────────────────────────────────────────────────

class _EmptyView extends StatelessWidget {
  final Future<void> Function() onRefresh;
  const _EmptyView({required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 80),
          const Icon(Icons.receipt_long_outlined,
              size: 64, color: BugieColors.textMuted),
          const SizedBox(height: 12),
          const Text('Aún no tienes pagos',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              'Cuando completes tu primer viaje verás aquí el historial de pagos.',
              textAlign: TextAlign.center,
              style: TextStyle(color: BugieColors.textMuted, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Error view — antes el error se tragaba sin avisar
// ─────────────────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off,
                size: 56, color: BugieColors.textMuted),
            const SizedBox(height: 12),
            const Text('No se pudieron cargar los pagos',
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 13, color: BugieColors.textMuted)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}
