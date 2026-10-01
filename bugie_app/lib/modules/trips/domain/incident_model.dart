/// Incidencia reportada sobre un viaje, por el pasajero o por el conductor.
/// Cada viaje puede tener una incidencia por rol (una del pasajero + una del
/// conductor). Mapea IncidentDto del backend.
class Incident {
  final String id;
  final String tripId;
  final String reportedByUserId;
  /// 'passenger' | 'driver'
  final String reportedByRole;
  final String description;
  final DateTime createdAt;
  /// Opcional: nombre del autor (lo expone el admin; en pasajero/conductor
  /// suele venir null).
  final String? reportedByName;

  Incident({
    required this.id,
    required this.tripId,
    required this.reportedByUserId,
    required this.reportedByRole,
    required this.description,
    required this.createdAt,
    this.reportedByName,
  });

  factory Incident.fromJson(Map<String, dynamic> j) => Incident(
        id:               j['id'].toString(),
        tripId:           j['tripId'].toString(),
        reportedByUserId: j['reportedByUserId'].toString(),
        reportedByRole:   (j['reportedByRole'] ?? '').toString(),
        description:      (j['description'] ?? '').toString(),
        createdAt:        DateTime.tryParse(j['createdAt'] ?? '') ??
                          DateTime.now(),
        reportedByName:   j['reportedByName']?.toString(),
      );
}
