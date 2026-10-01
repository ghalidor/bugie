/// Calificación que el pasajero da al conductor después de un viaje completado.
/// 1 a 5 estrellas, comentario opcional.
/// Mapea TripRatingDto del backend.
class Rating {
  final String id;
  final String tripId;
  final String passengerId;
  final String passengerName;
  final String driverId;
  final int stars;
  final String? comment;
  final DateTime createdAt;

  Rating({
    required this.id,
    required this.tripId,
    required this.passengerId,
    required this.passengerName,
    required this.driverId,
    required this.stars,
    this.comment,
    required this.createdAt,
  });

  factory Rating.fromJson(Map<String, dynamic> j) => Rating(
        id:            j['id'].toString(),
        tripId:        j['tripId'].toString(),
        passengerId:   j['passengerId'].toString(),
        passengerName: (j['passengerName'] ?? 'Pasajero').toString(),
        driverId:      j['driverId'].toString(),
        stars:         (j['stars'] as num).toInt(),
        comment:       j['comment'] as String?,
        createdAt:     DateTime.parse(j['createdAt'].toString()),
      );
}

/// Página de ratings para listas paginadas en el historial del conductor.
class RatingPage {
  final List<Rating> items;
  final int page;
  final int pageSize;
  final int total;

  RatingPage({
    required this.items,
    required this.page,
    required this.pageSize,
    required this.total,
  });

  factory RatingPage.fromJson(Map<String, dynamic> j) => RatingPage(
        items: (j['items'] as List<dynamic>? ?? [])
            .map((e) => Rating.fromJson(e as Map<String, dynamic>))
            .toList(),
        page:     (j['page'] as num).toInt(),
        pageSize: (j['pageSize'] as num).toInt(),
        total:    (j['total'] as num).toInt(),
      );

  bool get hasMore => page * pageSize < total;
}
