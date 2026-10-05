import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/payment_model.dart';

/// Repositorio de pagos (puerto 5004).
class PaymentsRepository {
  final ApiClient _api;
  PaymentsRepository(this._api);

  /// GET /api/payments/earnings  (solo driver)
  Future<DriverEarnings> getEarnings() async {
    final json = await _api.get('${ApiConfig.payments}/payments/earnings');
    return DriverEarnings.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/payments/payouts/me  (solo driver)
  /// Pagos que Bugie le hizo: bonos canjeados, premios de sorteo, manuales.
  Future<DriverPayouts> getMyPayouts() async {
    final json = await _api.get('${ApiConfig.payments}/payments/payouts/me');
    return DriverPayouts.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/payments/wallet/me  (solo driver)
  /// Billetera: ganancia neta, comision generada/pagada, deuda y movimientos.
  Future<DriverWallet> getMyWallet({int page = 1, int pageSize = 20}) async {
    final json = await _api.get(
        '${ApiConfig.payments}/payments/wallet/me?page=$page&pageSize=$pageSize');
    return DriverWallet.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/payments/my-payments  (pasajero)
  Future<List<Payment>> getMyPayments() async {
    final json = await _api.get('${ApiConfig.payments}/payments/my-payments');
    final list = (json as List?) ?? [];
    return list.map((p) => Payment.fromJson(p as Map<String, dynamic>)).toList();
  }
}
