/// Estados de un viaje (números devueltos por el backend Trips).
/// Vienen del enum TripStatus en backend/Trips/Bugie.Trips.Domain.
class TripStatus {
  static const pending     = 1; // Buscando conductor
  static const accepted    = 2; // Conductor en camino
  static const inProgress  = 3; // Viaje en curso
  static const completed   = 4;
  static const cancelled   = 5;
  static const sosActive   = 6;
  static const negotiating = 7; // Conductores proponen tarifa

  /// Texto amigable para el pasajero.
  static String labelForPassenger(int s) {
    switch (s) {
      case pending:     return 'Buscando conductor…';
      case accepted:    return 'Conductor en camino';
      case inProgress:  return 'Viaje en curso';
      case completed:   return 'Completado';
      case cancelled:   return 'Cancelado';
      case sosActive:   return 'SOS activo';
      case negotiating: return 'Conductores proponen tarifa';
      default:          return 'Desconocido';
    }
  }

  /// Texto amigable para el conductor.
  static String labelForDriver(int s) {
    switch (s) {
      case pending:     return 'Buscando pasajero…';
      case accepted:    return 'Aceptado — en camino';
      case inProgress:  return 'Viaje en curso';
      case completed:   return 'Completado';
      case cancelled:   return 'Cancelado';
      case sosActive:   return 'SOS activo';
      case negotiating: return 'En negociación';
      default:          return 'Desconocido';
    }
  }
}

/// Waypoint (parada intermedia) de un viaje.
class Waypoint {
  final String? id;
  final String address;
  final double lat;
  final double lng;
  final int sortOrder;

  Waypoint({
    this.id,
    required this.address,
    required this.lat,
    required this.lng,
    this.sortOrder = 0,
  });

  factory Waypoint.fromJson(Map<String, dynamic> j) => Waypoint(
        id: j['id']?.toString(),
        address: j['address'] ?? '',
        lat: (j['lat'] as num).toDouble(),
        lng: (j['lng'] as num).toDouble(),
        sortOrder: (j['sortOrder'] ?? 0) as int,
      );

  Map<String, dynamic> toJson() => {
        'address': address,
        'lat': lat,
        'lng': lng,
      };
}

/// Modelo principal Trip.
/// Mapea la respuesta de /api/trips/active y similares.
class Trip {
  final String id;
  final String passengerId;
  final String? passengerName;
  final String? passengerPhotoUrl;
  final String? driverName;
  final String? driverPhotoUrl;
  final double? driverRating;
  final String? vehiclePlate;
  final String? vehicleBrand;
  final String? vehicleModel;
  final String? vehicleColor;
  final String? vehiclePhotoUrl;
  /// Estrellas (1-5) que el pasajero dio a ESTE viaje (null si no calificó).
  final int? passengerStars;
  final String? driverId;
  final String originAddress;
  final double originLat;
  final double originLng;
  final String destAddress;
  final double destLat;
  final double destLng;
  final double estimatedFare;

  // -- Cupon aplicado al viaje --
  final String? couponCode;
  final double? discountAmount;
  /// Tarifa antes del descuento. Sin esto no se puede mostrar el desglose.
  final double? fareBeforeDiscount;
  final double? finalFare;
  final double? proposedFare;
  final int status;
  final String paymentMethod;
  final DateTime createdAt;
  final DateTime? acceptedAt;
  /// Cuando el conductor avisó que ya está en el punto de recojo.
  final DateTime? driverArrivedAt;
  final List<Waypoint> waypoints;

  /// Última posición conocida del conductor asignado.
  /// Solo presente cuando el viaje está accepted/inProgress/sosActive.
  /// Null si todavía no hay conductor o no ha reportado posición.
  final double? driverCurrentLat;
  final double? driverCurrentLng;
  final DateTime? driverLocationAt;

  // ---- Envio (Delivery) ----
  final int serviceType; // 0 = viaje, 1 = envio
  final String? packageDescription;
  final double? packageWeightKg;
  final bool packageIsFragile;
  final String? packageDetails;
  final bool pickupVerified;
  final String? pickupObservation;

  bool get isDelivery => serviceType == 1;

  Trip({
    required this.id,
    required this.passengerId,
    this.passengerName,
    this.passengerPhotoUrl,
    this.driverName,
    this.driverPhotoUrl,
    this.driverRating,
    this.vehiclePlate,
    this.vehicleBrand,
    this.vehicleModel,
    this.vehicleColor,
    this.vehiclePhotoUrl,
    this.passengerStars,
    this.driverId,
    required this.originAddress,
    required this.originLat,
    required this.originLng,
    required this.destAddress,
    required this.destLat,
    required this.destLng,
    required this.estimatedFare,
    this.couponCode,
    this.discountAmount,
    this.fareBeforeDiscount,
    this.finalFare,
    this.proposedFare,
    required this.status,
    required this.paymentMethod,
    required this.createdAt,
    this.acceptedAt,
    this.driverArrivedAt,
    this.waypoints = const [],
    this.driverCurrentLat,
    this.driverCurrentLng,
    this.driverLocationAt,
    this.serviceType = 0,
    this.packageDescription,
    this.packageWeightKg,
    this.packageIsFragile = false,
    this.packageDetails,
    this.pickupVerified = false,
    this.pickupObservation,
  });

  factory Trip.fromJson(Map<String, dynamic> j) => Trip(
        id:             j['id'].toString(),
        passengerId:    (j['passengerId'] ?? '').toString(),
        passengerName:  j['passengerName']?.toString(),
        passengerPhotoUrl: j['passengerPhotoUrl']?.toString(),
        driverName:     j['driverName']?.toString(),
        driverPhotoUrl: j['driverPhotoUrl']?.toString(),
        driverRating:   (j['driverRating'] as num?)?.toDouble(),
        vehiclePlate:   j['vehiclePlate']?.toString(),
        vehicleBrand:   j['vehicleBrand']?.toString(),
        vehicleModel:   j['vehicleModel']?.toString(),
        vehicleColor:   j['vehicleColor']?.toString(),
        vehiclePhotoUrl: j['vehiclePhotoUrl']?.toString(),
        passengerStars: (j['passengerStars'] as num?)?.toInt(),
        driverId:       j['driverId']?.toString(),
        originAddress:  j['originAddress'] ?? '',
        originLat:      (j['originLat'] as num).toDouble(),
        originLng:      (j['originLng'] as num).toDouble(),
        destAddress:    j['destAddress'] ?? '',
        destLat:        (j['destLat'] as num).toDouble(),
        destLng:        (j['destLng'] as num).toDouble(),
        estimatedFare:  (j['estimatedFare'] as num).toDouble(),
        couponCode:         j['couponCode']?.toString(),
        discountAmount:     (j['discountAmount']     as num?)?.toDouble(),
        fareBeforeDiscount: (j['fareBeforeDiscount'] as num?)?.toDouble(),
        finalFare:      (j['finalFare'] as num?)?.toDouble(),
        proposedFare:   (j['proposedFare'] as num?)?.toDouble(),
        status:         (j['status'] ?? 1) as int,
        paymentMethod:  j['paymentMethod'] ?? 'cash',
        createdAt:      DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        acceptedAt:     DateTime.tryParse(j['acceptedAt'] ?? ''),
        driverArrivedAt: DateTime.tryParse(j['driverArrivedAt'] ?? ''),
        waypoints: (j['waypoints'] as List?)
                ?.map((w) => Waypoint.fromJson(w as Map<String, dynamic>))
                .toList() ??
            [],
        driverCurrentLat: (j['driverCurrentLat'] as num?)?.toDouble(),
        driverCurrentLng: (j['driverCurrentLng'] as num?)?.toDouble(),
        driverLocationAt: DateTime.tryParse(j['driverLocationAt'] ?? ''),
        serviceType:       (j['serviceType'] ?? 0) as int,
        packageDescription: j['packageDescription']?.toString(),
        packageWeightKg:   (j['packageWeightKg'] as num?)?.toDouble(),
        packageIsFragile:   j['packageIsFragile'] == true,
        packageDetails:    j['packageDetails']?.toString(),
        pickupVerified:     j['pickupVerified'] == true,
        pickupObservation: j['pickupObservation']?.toString(),
      );
}
