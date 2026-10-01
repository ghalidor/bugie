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

  /// GET /api/payments/my-payments  (pasajero)
  Future<List<Payment>> getMyPayments() async {
    final json = await _api.get('${ApiConfig.payments}/payments/my-payments');
    final list = (json as List?) ?? [];
    return list.map((p) => Payment.fromJson(p as Map<String, dynamic>)).toList();
  }

  /// PUT /api/payments/{id}/complete
  Future<Payment> completePayment(String paymentId, {String? reference}) async {
    final json = await _api.put(
      '${ApiConfig.payments}/payments/$paymentId/complete',
      body: reference == null ? null : {'reference': reference},
    );
    return Payment.fromJson(json as Map<String, dynamic>);
  }
}
