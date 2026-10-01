/// Estado del pago, tal como lo devuelve el backend Payments
/// (la entidad Payment guarda el estado como STRING, no como int).
class PaymentStatus {
  static const pending   = 'pending';
  static const completed = 'completed';
  static const failed    = 'failed';
  static const refunded  = 'refunded';

  static String label(String s) {
    switch (s) {
      case pending:   return 'Pendiente';
      case completed: return 'Completado';
      case failed:    return 'Fallido';
      case refunded:  return 'Reembolsado';
      default:        return s;
    }
  }
}

class Payment {
  final String id;
  final String tripId;
  final String passengerId;
  final String driverId;
  final double amount;
  final String method; // 'cash' | 'yape' | 'plin'
  final String status; // 'pending' | 'completed' | 'failed' | 'refunded'
  final String? reference;
  final DateTime createdAt;
  final DateTime? paidAt;

  Payment({
    required this.id,
    required this.tripId,
    required this.passengerId,
    required this.driverId,
    required this.amount,
    required this.method,
    required this.status,
    required this.createdAt,
    this.reference,
    this.paidAt,
  });

  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id:          j['id'].toString(),
        tripId:      j['tripId'].toString(),
        passengerId: j['passengerId'].toString(),
        driverId:    j['driverId'].toString(),
        amount:      (j['amount'] as num).toDouble(),
        method:      (j['method'] ?? 'cash').toString(),
        status:      (j['status'] ?? 'pending').toString(),
        reference:   j['reference']?.toString(),
        createdAt:   DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        paidAt:      j['paidAt'] == null
            ? null
            : DateTime.tryParse(j['paidAt'].toString()),
      );
}

/// Resumen de ganancias del conductor (endpoint /payments/earnings).
class DriverEarnings {
  final double totalEarnings;
  final int totalTrips;
  final double earningsThisMonth;

  DriverEarnings({
    required this.totalEarnings,
    required this.totalTrips,
    required this.earningsThisMonth,
  });

  factory DriverEarnings.fromJson(Map<String, dynamic> j) => DriverEarnings(
        totalEarnings:     (j['totalEarnings'] as num? ?? 0).toDouble(),
        totalTrips:        (j['totalTrips'] ?? 0) as int,
        earningsThisMonth: (j['earningsThisMonth'] as num? ?? 0).toDouble(),
      );
}