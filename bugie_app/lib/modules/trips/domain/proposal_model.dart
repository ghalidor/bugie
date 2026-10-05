/// Tendencia de la propuesta respecto a la anterior del mismo conductor.
/// El backend la calcula automáticamente.
enum ProposalTrend {
  /// Primera propuesta de este conductor en este viaje.
  isNew,
  /// El conductor bajó su precio respecto a la propuesta anterior.
  down,
  /// El conductor subió su precio respecto a la propuesta anterior.
  up,
}

ProposalTrend _trendFromString(String? s) {
  switch (s) {
    case 'down': return ProposalTrend.down;
    case 'up':   return ProposalTrend.up;
    case 'new':
    default:     return ProposalTrend.isNew;
  }
}

/// Propuesta de tarifa enriquecida.
/// Backend: GET /api/trips/{id}/proposals
/// Devuelve los campos básicos + nombre del conductor + datos del vehículo +
/// tendencia respecto a la propuesta anterior del mismo conductor.
class Proposal {
  final String id;
  final String tripId;
  final String driverId;
  final double fare;
  final String status; // 'pending' | 'accepted' | 'rejected' | 'superseded'
  final DateTime createdAt;

  // Enriquecidos
  final String driverName;
  final String? vehiclePlate;
  final String? vehicleBrand;
  final String? vehicleModel;
  final String? vehicleColor;
  final ProposalTrend trend;
  final double? previousFare;

  /// Quién hizo esta propuesta:
  ///   - 'driver'    → propuesta normal del conductor.
  ///   - 'passenger' → contrapropuesta del pasajero hacia ese conductor.
  final String proposedByRole;

  /// Si Status == 'rejected', quién la rechazó: 'driver' | 'passenger' | null.
  final String? rejectedBy;

  /// Foto de perfil del conductor (URL relativa que devuelve el backend).
  final String? driverPhotoUrl;

  /// Calificación promedio del conductor (null si aún no tiene).
  final double? driverRating;
  final int driverRatingCount;

  Proposal({
    required this.id,
    required this.tripId,
    required this.driverId,
    required this.fare,
    required this.status,
    required this.createdAt,
    this.driverName = 'Conductor',
    this.vehiclePlate,
    this.vehicleBrand,
    this.vehicleModel,
    this.vehicleColor,
    this.trend = ProposalTrend.isNew,
    this.previousFare,
    this.proposedByRole = 'driver',
    this.rejectedBy,
    this.driverPhotoUrl,
    this.driverRating,
    this.driverRatingCount = 0,
  });

  factory Proposal.fromJson(Map<String, dynamic> j) => Proposal(
        id:             j['id'].toString(),
        tripId:         j['tripId'].toString(),
        driverId:       j['driverId'].toString(),
        fare:           (j['fare'] as num).toDouble(),
        status:         (j['status'] ?? 'pending').toString(),
        createdAt:      DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        driverName:     (j['driverName'] ?? 'Conductor').toString(),
        vehiclePlate:   j['vehiclePlate']?.toString(),
        vehicleBrand:   j['vehicleBrand']?.toString(),
        vehicleModel:   j['vehicleModel']?.toString(),
        vehicleColor:   j['vehicleColor']?.toString(),
        trend:          _trendFromString(j['trend']?.toString()),
        previousFare:   (j['previousFare'] as num?)?.toDouble(),
        proposedByRole: (j['proposedByRole'] ?? 'driver').toString(),
        rejectedBy:     j['rejectedBy']?.toString(),
        driverPhotoUrl: j['driverPhotoUrl']?.toString(),
        driverRating:   (j['driverRating'] as num?)?.toDouble(),
        driverRatingCount: (j['driverRatingCount'] as num?)?.toInt() ?? 0,
      );

  /// Descripción legible del vehículo (ej: "Toyota · Corolla · Rojo").
  String? get vehicleSummary {
    final parts = [vehicleBrand, vehicleModel, vehicleColor]
        .where((s) => s != null && s.isNotEmpty)
        .toList();
    return parts.isEmpty ? null : parts.join(' · ');
  }

  /// Atajos para identificar el tipo de card en la UI del pasajero.
  bool get isCounterFromMe => proposedByRole == 'passenger';

  /// El conductor aceptó el viaje a tarifa estimada (flujo "aceptar directo").
  /// Al aceptarlo el pasajero, se asigna directo (sin reconfirmación).
  bool get isDirectAccept => status == 'driver_accepted';
  bool get isDeclinedByDriver => status == 'rejected' && rejectedBy == 'driver';

  /// True si esta propuesta está esperando que el conductor confirme.
  /// El pasajero la ve para no aceptar otra; el conductor la ve con botón
  /// "Confirmar y empezar viaje".
  bool get isWaitingDriverConfirmation =>
      status == 'accepted_by_passenger';
}

/// Una entrada del histórico de propuestas de UN conductor en UN viaje.
/// Solo informativa (modal en el frontend).
/// Backend: GET /api/trips/{id}/proposals/history?driverId=X
class ProposalHistoryEntry {
  final String id;
  final double fare;
  /// 'pending' | 'superseded' | 'accepted' | 'rejected'
  final String status;
  final DateTime createdAt;
  /// 'driver' | 'passenger'
  final String proposedByRole;
  /// 'driver' | 'passenger' | null
  final String? rejectedBy;

  ProposalHistoryEntry({
    required this.id,
    required this.fare,
    required this.status,
    required this.createdAt,
    this.proposedByRole = 'driver',
    this.rejectedBy,
  });

  factory ProposalHistoryEntry.fromJson(Map<String, dynamic> j) =>
      ProposalHistoryEntry(
        id:             j['id'].toString(),
        fare:           (j['fare'] as num).toDouble(),
        status:         (j['status'] ?? 'pending').toString(),
        createdAt:      DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        proposedByRole: (j['proposedByRole'] ?? 'driver').toString(),
        rejectedBy:     j['rejectedBy']?.toString(),
      );

  /// Texto humano del estado.
  String get statusLabel {
    switch (status) {
      case 'pending':                return 'Actual';
      case 'superseded':             return 'Modificada';
      case 'accepted_by_passenger':  return 'Esperando confirmación del conductor';
      case 'accepted':               return 'Aceptada';
      case 'rejected':               return 'Rechazada';
      default:                       return status;
    }
  }
}

/// Lo que el backend le devuelve AL CONDUCTOR para mostrar
/// el banner del estado de negociación con el pasajero.
/// GET /api/trips/my-counter-proposals?tripIds=...
///
/// El backend ya garantiza prioridad: nunca devuelve dos cosas a la vez para
/// el mismo viaje. Posibles combinaciones:
///   - status='pending'  + proposedByRole='passenger' → contrapropuesta del pasajero (banner naranja).
///   - status='pending'  + proposedByRole='driver'    → mi propia propuesta vigente (banner azul).
///   - status='rejected' + proposedByRole='driver'    → el pasajero rechazó mi propuesta (banner rojo, 24h).
class DriverCounterInfo {
  final String id;
  final double fare;
  final DateTime createdAt;
  /// 'pending' | 'rejected'
  final String status;
  /// 'driver' | 'passenger'
  final String proposedByRole;

  DriverCounterInfo({
    required this.id,
    required this.fare,
    required this.createdAt,
    required this.status,
    required this.proposedByRole,
  });

  factory DriverCounterInfo.fromJson(Map<String, dynamic> j) =>
      DriverCounterInfo(
        id:             j['id'].toString(),
        fare:           (j['fare'] as num).toDouble(),
        createdAt:      DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        status:         (j['status'] ?? 'pending').toString(),
        proposedByRole: (j['proposedByRole'] ?? 'driver').toString(),
      );

  bool get isCounterFromPassenger =>
      status == 'pending' && proposedByRole == 'passenger';
  bool get isMyPending =>
      status == 'pending' && proposedByRole == 'driver';
  bool get isRejected => status == 'rejected';
  /// El pasajero aceptó mi propuesta y está esperando que yo confirme.
  /// Banner verde + botón "Confirmar y empezar viaje".
  bool get isWaitingMyConfirmation => status == 'accepted_by_passenger';
}
