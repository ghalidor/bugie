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

/// Pago que Bugie le hizo al conductor: bono canjeado con puntos,
/// premio de sorteo o pago manual (endpoint /payments/payouts/me).
class DriverPayout {
  final String id;
  final double amount;
  final String method;          // yape | plin | transferencia | efectivo
  final String? operationNumber;
  final DateTime? paidAt;
  final String? note;
  final String sourceType;      // reward_redemption | raffle_prize | manual

  DriverPayout({
    required this.id,
    required this.amount,
    required this.method,
    this.operationNumber,
    this.paidAt,
    this.note,
    required this.sourceType,
  });

  String get methodLabel => switch (method) {
        'yape' => 'Yape',
        'plin' => 'Plin',
        'transferencia' => 'Transferencia',
        'efectivo' => 'Efectivo',
        _ => method,
      };

  String get sourceLabel => switch (sourceType) {
        'reward_redemption' => 'Bono canjeado con puntos',
        'raffle_prize' => 'Premio de sorteo',
        _ => 'Pago de Bugie',
      };

  factory DriverPayout.fromJson(Map<String, dynamic> j) => DriverPayout(
        id:              j['id'] as String,
        amount:          (j['amount'] as num? ?? 0).toDouble(),
        method:          (j['method'] ?? '') as String,
        operationNumber: j['operationNumber'] as String?,
        paidAt:          DateTime.tryParse(j['paidAt'] ?? ''),
        note:            j['note'] as String?,
        sourceType:      (j['sourceType'] ?? 'manual') as String,
      );
}

/// Pagos recibidos + total.
class DriverPayouts {
  final List<DriverPayout> items;
  final double totalAmount;
  DriverPayouts({required this.items, required this.totalAmount});

  factory DriverPayouts.fromJson(Map<String, dynamic> j) => DriverPayouts(
        items: ((j['items'] as List?) ?? [])
            .map((p) => DriverPayout.fromJson(p as Map<String, dynamic>))
            .toList(),
        totalAmount: (j['totalAmount'] as num? ?? 0).toDouble(),
      );
}