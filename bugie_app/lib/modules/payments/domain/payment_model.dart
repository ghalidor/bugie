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
  /// Codigo del pago: canje (BG-...), premio (PZ-...) o comprobante manual (PAG-...).
  final String? code;

  DriverPayout({
    required this.id,
    required this.amount,
    required this.method,
    this.operationNumber,
    this.paidAt,
    this.note,
    required this.sourceType,
    this.code,
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
        code:            j['code'] as String?,
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

/// Movimiento de la billetera del conductor (endpoint /payments/wallet/me).
///   comision      -> un viaje genero comision (el conductor la debe)
///   pago_comision -> el conductor le pago comision a Bugie
class WalletMovement {
  final int id;
  final String type;
  final double amount;
  final double balanceAfter;
  final double? tripAmount;
  final String? method;
  final String? operationNumber;
  final String? note;
  final DateTime? paidAt;
  final DateTime createdAt;

  WalletMovement({
    required this.id,
    required this.type,
    required this.amount,
    required this.balanceAfter,
    this.tripAmount,
    this.method,
    this.operationNumber,
    this.note,
    this.paidAt,
    required this.createdAt,
  });

  bool get isCommission => type == 'comision';

  String get methodLabel => switch (method) {
        'yape' => 'Yape',
        'plin' => 'Plin',
        'transferencia' => 'Transferencia',
        'efectivo' => 'Efectivo',
        _ => method ?? '',
      };

  factory WalletMovement.fromJson(Map<String, dynamic> j) => WalletMovement(
        id:              (j['id'] as num? ?? 0).toInt(),
        type:            (j['type'] ?? '') as String,
        amount:          (j['amount'] as num? ?? 0).toDouble(),
        balanceAfter:    (j['balanceAfter'] as num? ?? 0).toDouble(),
        tripAmount:      (j['tripAmount'] as num?)?.toDouble(),
        method:          j['method'] as String?,
        operationNumber: j['operationNumber'] as String?,
        note:            j['note'] as String?,
        paidAt:          DateTime.tryParse(j['paidAt']?.toString() ?? ''),
        createdAt:       DateTime.tryParse(j['createdAt']?.toString() ?? '') ?? DateTime.now(),
      );
}

/// Billetera del conductor: el cobra todo en mano y le debe la comision a Bugie.
class DriverWallet {
  final double totalEarned;          // ganancia neta (monto - comision)
  final double totalCommission;      // comision generada
  final double totalCommissionPaid;  // comision ya pagada
  final double pendingDebt;          // lo que debe hoy
  final double currentFeePercent;    // comision vigente (10 = 10%)
  final List<WalletMovement> movements;
  final int total;
  final int page;
  final int pageSize;

  DriverWallet({
    required this.totalEarned,
    required this.totalCommission,
    required this.totalCommissionPaid,
    required this.pendingDebt,
    required this.currentFeePercent,
    required this.movements,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  bool get hasMore => page * pageSize < total;

  factory DriverWallet.fromJson(Map<String, dynamic> j) {
    final s = (j['summary'] as Map<String, dynamic>?) ?? const {};
    double n(Object? v) => (v as num? ?? 0).toDouble();
    return DriverWallet(
      totalEarned:         n(s['totalEarned']),
      totalCommission:     n(s['totalCommission']),
      totalCommissionPaid: n(s['totalCommissionPaid']),
      pendingDebt:         n(s['pendingDebt']),
      currentFeePercent:   n(j['currentFeePercent']),
      movements: ((j['movements'] as List?) ?? [])
          .map((m) => WalletMovement.fromJson(m as Map<String, dynamic>))
          .toList(),
      total:    (j['total'] as num? ?? 0).toInt(),
      page:     (j['page'] as num? ?? 1).toInt(),
      pageSize: (j['pageSize'] as num? ?? 20).toInt(),
    );
  }
}
