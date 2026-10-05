import 'dart:convert';
import 'package:latlong2/latlong.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/incident_model.dart';
import '../domain/proposal_model.dart';
import '../domain/rating_model.dart';
import '../domain/route_model.dart';
import '../domain/trip_model.dart';
import '../domain/trip_photo_model.dart';
import '../../../core/widgets/schedule_picker.dart';

/// Repositorio de viajes (puerto 5002).
/// Lo usan tanto el módulo passenger como driver.
class TripsRepository {
  final ApiClient _api;
  TripsRepository(this._api);

  // ── Pasajero ─────────────────────────────────────────────────────────────

  /// POST /api/trips — crea un VIAJE (serviceType 0). Los envíos usan
  /// [createDelivery] (POST /api/trips/delivery).
  Future<Trip> create({
    required String originAddress,
    required double originLat,
    required double originLng,
    required String destAddress,
    required double destLat,
    required double destLng,
    required double estimatedFare,
    required String paymentMethod, // 'cash' | 'yape' | 'plin'
    List<Waypoint> waypoints = const [],
    // Programado: hora de Perú. null = ahora.
    DateTime? scheduledAt,
  }) async {
    final json = await _api.post('${ApiConfig.trips}/trips', body: {
      if (scheduledAt != null) 'scheduledAt': Schedule.toApi(scheduledAt),
      'originAddress': originAddress,
      'originLat': originLat,
      'originLng': originLng,
      'destAddress': destAddress,
      'destLat': destLat,
      'destLng': destLng,
      'estimatedFare': estimatedFare,
      'paymentMethod': paymentMethod,
      'waypoints': waypoints.map((w) => w.toJson()).toList(),
      'serviceType': 0,
    });
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// POST /api/trips/delivery — crea el ENVÍO con sus fotos en una sola
  /// petición (campo "data" = JSON del envío, "files" = 1 a 5 fotos).
  /// Si faltan fotos o alguna no es válida, el backend no crea nada: un envío
  /// sin fotos del paquete nunca llega a los conductores.
  Future<Trip> createDelivery({
    required String originAddress,
    required double originLat,
    required double originLng,
    required String destAddress,
    required double destLat,
    required double destLng,
    required double estimatedFare,
    required String paymentMethod,
    List<Waypoint> waypoints = const [],
    required String packageDescription,
    double? packageWeightKg,
    bool packageIsFragile = false,
    String? packageDetails,
    required String recipientName,
    required String recipientPhone,
    required List<String> photoPaths,
    // Programado: hora de Perú. null = ahora.
    DateTime? scheduledAt,
  }) async {
    final data = {
      if (scheduledAt != null) 'scheduledAt': Schedule.toApi(scheduledAt),
      'originAddress': originAddress,
      'originLat': originLat,
      'originLng': originLng,
      'destAddress': destAddress,
      'destLat': destLat,
      'destLng': destLng,
      'estimatedFare': estimatedFare,
      'paymentMethod': paymentMethod,
      'waypoints': waypoints.map((w) => w.toJson()).toList(),
      'serviceType': 1,
      'packageDescription': packageDescription,
      'packageWeightKg': packageWeightKg,
      'packageIsFragile': packageIsFragile,
      'packageDetails': packageDetails,
      'recipientName': recipientName,
      'recipientPhone': recipientPhone,
    };
    final json = await _api.postMultipartMany(
      '${ApiConfig.trips}/trips/delivery',
      fields: {'data': jsonEncode(data)},
      files: [for (final p in photoPaths) MapEntry('files', p)],
    );
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/trips/{id} — un viaje (aunque ya no este activo). Sirve para
  /// saber como termino: completado o cancelado, quien y por que.
  Future<Trip> getById(String tripId) async {
    final json = await _api.get('${ApiConfig.trips}/trips/$tripId');
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// POST /api/trips/{id}/delivery-confirmation — el conductor confirma la
  /// entrega en destino: foto + quien recibio.
  Future<void> uploadDeliveryConfirmation(
    String tripId, {
    required String photoPath,
    required String receivedBy,
  }) async {
    await _api.postMultipartMany(
      '${ApiConfig.trips}/trips/$tripId/delivery-confirmation',
      fields: {'receivedBy': receivedBy},
      files: [MapEntry('photo', photoPath)],
    );
  }


  /// GET /api/trips/{id}/photos — fotos del envío (paquete, recojo y
  /// entrega). Solo la ven el pasajero, el conductor del viaje o un admin.
  Future<List<TripPhoto>> getPhotos(String tripId) async {
    final json = await _api.get('${ApiConfig.trips}/trips/$tripId/photos');
    final list = (json as List?) ?? [];
    return list
        .map((p) => TripPhoto.fromJson(p as Map<String, dynamic>))
        .toList();
  }

  /// GET /api/trips/{id}/planned-route — ruta que trazó el sistema
  /// (tramo de recogida y tramo del viaje). Solo pasajero o conductor del viaje.
  Future<PlannedRoute> getPlannedRoute(String tripId) async {
    final json =
        await _api.get('${ApiConfig.trips}/trips/$tripId/planned-route');
    return PlannedRoute.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/trips/{id}/real-path — recorrido GPS real del conductor.
  /// Solo pasajero o conductor del viaje.
  Future<RealPath> getRealPath(String tripId) async {
    final json = await _api.get('${ApiConfig.trips}/trips/$tripId/real-path');
    return RealPath.fromJson(json as Map<String, dynamic>);
  }

  /// POST /api/trips/{id}/pickup-verification — el conductor sube la
  /// verificación del paquete al recoger (foto principal + secundarias +
  /// observación). Habilita "Paquete a bordo".
  Future<void> uploadPickupVerification(
    String tripId, {
    required String mainPath,
    List<String> secondaryPaths = const [],
    String? observation,
  }) async {
    await _api.postMultipartMany(
      '${ApiConfig.trips}/trips/$tripId/pickup-verification',
      fields: {if (observation != null) 'observation': observation},
      files: [
        MapEntry('main', mainPath),
        for (final p in secondaryPaths) MapEntry('secondary', p),
      ],
    );
  }

  /// GET /api/trips/scheduled — programados vigentes (pendientes, negociando
  /// o aceptados) ordenados por hora. Pasajero: los suyos. Conductor: los
  /// que tiene asignados.
  Future<List<Trip>> getScheduled() async {
    final json = await _api.get('${ApiConfig.trips}/trips/scheduled');
    final list = (json as List?) ?? [];
    return list.map((t) => Trip.fromJson(t as Map<String, dynamic>)).toList();
  }

  /// GET /api/trips/{id}/tracking — seguimiento de UN viaje (con conductor y
  /// vehículo), aunque todavía no sea el activo (ej. un programado).
  Future<Trip> getTracking(String tripId) async {
    final json = await _api.get('${ApiConfig.trips}/trips/$tripId/tracking');
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// PUT /api/trips/{id}/republish — el conductor del programado no llegó:
  /// vuelve a pendiente para otros conductores (se quita al conductor).
  Future<Trip> republish(String tripId) async {
    final json = await _api.put('${ApiConfig.trips}/trips/$tripId/republish');
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/trips/active
  Future<Trip?> getActive() async {
    final json = await _api.get('${ApiConfig.trips}/trips/active');
    if (json == null) return null;
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/trips/history
  Future<List<Trip>> getHistory() async {
    final json = await _api.get('${ApiConfig.trips}/trips/history');
    final list = (json as List?) ?? [];
    return list.map((t) => Trip.fromJson(t as Map<String, dynamic>)).toList();
  }

  /// PUT /api/trips/{id}/cancel
  /// PUT /api/trips/{id}/cancel — lo usa el pasajero y el conductor.
  /// El backend registra quién canceló; [reason] es opcional.
  Future<void> cancel(String tripId, {String? reason}) async {
    await _api.put(
      '${ApiConfig.trips}/trips/$tripId/cancel',
      body: reason == null || reason.trim().isEmpty ? null : {'reason': reason.trim()},
    );
  }

  /// PUT /api/trips/passenger-location
  /// El pasajero envía su ubicación durante el viaje activo.
  /// El backend valida internamente si hay viaje en curso; si no, ignora.
  /// El cliente Flutter hace throttle (LocationTrackingService) antes de llamar.
  Future<void> updatePassengerLocation({
    required double lat,
    required double lng,
  }) async {
    await _api.put(
      '${ApiConfig.trips}/trips/passenger-location',
      body: {'lat': lat, 'lng': lng},
    );
  }

  /// GET /api/trips/{id}/proposals
  /// El backend ya devuelve un solo card por conductor (CTE con ROW_NUMBER).
  Future<List<Proposal>> getProposals(String tripId) async {
    final json = await _api.get('${ApiConfig.trips}/trips/$tripId/proposals');
    final list = (json as List?) ?? [];
    return list.map((p) => Proposal.fromJson(p as Map<String, dynamic>)).toList();
  }

  /// GET /api/trips/{id}/proposals/history?driverId=X
  Future<List<ProposalHistoryEntry>> getProposalHistory(
      String tripId, String driverId) async {
    final json = await _api.get(
      '${ApiConfig.trips}/trips/$tripId/proposals/history?driverId=$driverId',
    );
    final list = (json as List?) ?? [];
    return list
        .map((e) => ProposalHistoryEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// PUT /api/trips/{id}/accept-proposal/{proposalId}
  ///
  /// FLUJO NUEVO: este endpoint solo marca la propuesta como
  /// 'accepted_by_passenger'. NO asigna conductor todavía. El backend devuelve
  /// {message, tripId, proposalId, status} en lugar de un Trip completo.
  /// Para que el viaje quede asignado, el conductor debe llamar a
  /// /confirm-acceptance.
  Future<void> acceptProposal(String tripId, String proposalId) async {
    await _api.put(
      '${ApiConfig.trips}/trips/$tripId/accept-proposal/$proposalId',
    );
  }

  /// PUT /api/trips/{id}/confirm-acceptance/{proposalId}
  ///
  /// El CONDUCTOR confirma una propuesta que el pasajero ya aceptó.
  /// Ahora sí: se asigna el conductor, el viaje pasa a Accepted y todas las
  /// demás propuestas pending del conductor en OTROS viajes se rechazan en
  /// cascada (driver_busy). Devuelve el Trip resultante.
  Future<Trip> confirmAcceptance(String tripId, String proposalId) async {
    final json = await _api.put(
      '${ApiConfig.trips}/trips/$tripId/confirm-acceptance/$proposalId',
    );
    final m = json as Map<String, dynamic>;
    // El backend envía { tripDto, otherProposalsRejected }
    final tripJson = m['tripDto'] as Map<String, dynamic>;
    return Trip.fromJson(tripJson);
  }

  /// PUT /api/trips/{id}/confirm-driver-acceptance/{proposalId}
  ///
  /// El PASAJERO confirma la aceptación de un conductor (flujo "aceptar
  /// directo"). Aquí se asigna el conductor y el viaje pasa a Accepted.
  Future<Trip> confirmDriverAcceptance(String tripId, String proposalId) async {
    final json = await _api.put(
      '${ApiConfig.trips}/trips/$tripId/confirm-driver-acceptance/$proposalId',
    );
    final m = json as Map<String, dynamic>;
    final tripJson = m['tripDto'] as Map<String, dynamic>;
    return Trip.fromJson(tripJson);
  }

  /// PUT /api/trips/{id}/cancel-acceptance/{proposalId}
  ///
  /// El PASAJERO deshace su aceptación. La propuesta vuelve a 'pending' y
  /// queda registrado en trips.PassengerAcceptanceCancellations para auditoría.
  /// El pasajero queda libre para aceptar otra propuesta.
  /// Backend rechaza con 409 si el conductor ya confirmó (race condition).
  Future<void> cancelAcceptance(String tripId, String proposalId) async {
    await _api.put(
      '${ApiConfig.trips}/trips/$tripId/cancel-acceptance/$proposalId',
    );
  }

  /// PUT /api/trips/{tripId}/proposals/{proposalId}/reject
  /// El pasajero rechaza UNA propuesta puntual del conductor.
  Future<void> rejectOneProposal(String tripId, String proposalId) async {
    await _api.put(
      '${ApiConfig.trips}/trips/$tripId/proposals/$proposalId/reject',
    );
  }

  /// PUT /api/trips/{tripId}/proposals/reject-all
  /// El pasajero rechaza TODAS las propuestas pending del viaje.
  /// Cada conductor verá el feedback "el pasajero rechazó tu propuesta".
  Future<void> rejectAllProposals(String tripId) async {
    await _api.put('${ApiConfig.trips}/trips/$tripId/proposals/reject-all');
  }

  /// POST /api/trips/{tripId}/counter
  /// El pasajero envía una contrapropuesta hacia un conductor específico.
  Future<void> counterPropose({
    required String tripId,
    required String driverId,
    required double fare,
  }) async {
    await _api.post(
      '${ApiConfig.trips}/trips/$tripId/counter',
      body: {'driverId': driverId, 'fare': fare},
    );
  }

  // ── Conductor ────────────────────────────────────────────────────────────

  /// GET /api/trips/pending
  Future<List<Trip>> getPending() async {
    final json = await _api.get('${ApiConfig.trips}/trips/pending');
    final list = (json as List?) ?? [];
    return list.map((t) => Trip.fromJson(t as Map<String, dynamic>)).toList();
  }

  /// PUT /api/trips/{id}/accept
  Future<Trip> accept(String tripId) async {
    final json = await _api.put('${ApiConfig.trips}/trips/$tripId/accept');
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// POST /api/trips/{id}/driver-accept
  ///
  /// El conductor acepta el viaje a tarifa estimada, pero NO se asigna: queda
  /// esperando que el pasajero confirme (varios conductores pueden aceptar).
  Future<void> driverAccept(String tripId) async {
    await _api.post('${ApiConfig.trips}/trips/$tripId/driver-accept');
  }

  /// PUT /api/trips/{id}/propose
  Future<void> proposeFare(String tripId, double fare) async {
    await _api.put(
      '${ApiConfig.trips}/trips/$tripId/propose',
      body: {'proposedFare': fare},
    );
  }

  /// PUT /api/trips/{tripId}/decline-by-driver
  /// El conductor declina el viaje. Marca todas sus propuestas (y las
  /// contrapropuestas del pasajero hacia él) como rejected/driver.
  Future<void> declineByDriver(String tripId) async {
    await _api.put('${ApiConfig.trips}/trips/$tripId/decline-by-driver');
  }

  /// GET /api/trips/my-counter-proposals?tripIds=...
  /// Por cada viaje, devuelve EL estado relevante para el conductor:
  ///   - contrapropuesta vigente del pasajero (banner naranja),
  ///   - mi propuesta vigente esperando respuesta (banner azul),
  ///   - feedback de rechazo (banner rojo, 24h).
  /// Nunca devuelve dos a la vez.
  Future<Map<String, DriverCounterInfo>> getMyCounterProposals(
      List<String> tripIds) async {
    if (tripIds.isEmpty) return {};
    final qs = tripIds.map((id) => 'tripIds=$id').join('&');
    final json = await _api.get(
      '${ApiConfig.trips}/trips/my-counter-proposals?$qs',
    );
    final map = (json as Map<String, dynamic>?) ?? {};
    return map.map(
      (key, value) => MapEntry(
        key,
        DriverCounterInfo.fromJson(value as Map<String, dynamic>),
      ),
    );
  }

  /// PUT /api/trips/{id}/arrived — el conductor avisa al pasajero que ya
  /// está en el punto de recojo (le llega un push). Se puede repetir.
  Future<Trip> markArrived(String tripId) async {
    final json = await _api.put('${ApiConfig.trips}/trips/$tripId/arrived');
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// PUT /api/trips/{id}/start
  Future<Trip> start(String tripId) async {
    final json = await _api.put('${ApiConfig.trips}/trips/$tripId/start');
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// POST /api/trips/{id}/coupon
  ///
  /// Aplica uno de mis cupones al precio de este viaje. El cupon NO se
  /// consume aca: eso pasa al completar el viaje. Si el viaje se cancela,
  /// el cupon vuelve a quedar disponible.
  ///
  /// El backend decide si se puede y cuanto descuenta de verdad: puede
  /// aplicar menos de lo que vale el cupon, y lo avisa en "warning".
  Future<CouponApplied> applyCoupon(String tripId, String code) async {
    final json = await _api.post(
      '${ApiConfig.trips}/trips/$tripId/coupon',
      body: {'code': code.trim().toUpperCase()},
    );
    return CouponApplied.fromJson(json as Map<String, dynamic>);
  }

  /// DELETE /api/trips/{id}/coupon
  Future<void> removeCoupon(String tripId) async {
    await _api.delete('${ApiConfig.trips}/trips/$tripId/coupon');
  }

  /// PUT /api/trips/{id}/complete
  Future<Trip> complete(String tripId, {double? finalFare}) async {
    final json = await _api.put(
      '${ApiConfig.trips}/trips/$tripId/complete',
      body: finalFare == null ? null : {'finalFare': finalFare},
    );
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  // ── Rutas (cálculo + trazado) ────────────────────────────────────────────

  /// GET /api/trips/route — ruta directa origen-destino.
  Future<RouteInfo> getRoute({
    required double originLat,
    required double originLng,
    required double destLat,
    required double destLng,
  }) async {
    final url =
        '${ApiConfig.trips}/trips/route?olat=$originLat&olng=$originLng&dlat=$destLat&dlng=$destLng';
    final json = await _api.get(url);
    return RouteInfo.fromJson(json as Map<String, dynamic>);
  }

  /// POST /api/trips/route/waypoints — ruta con paradas intermedias.
  Future<RouteInfo> getRouteWithWaypoints(List<LatLng> points) async {
    final json = await _api.post(
      '${ApiConfig.trips}/trips/route/waypoints',
      body: {
        'points': points
            .map((p) => {'lat': p.latitude, 'lng': p.longitude})
            .toList(),
      },
    );
    return RouteInfo.fromJson(json as Map<String, dynamic>);
  }

  // ── Incidencias ──────────────────────────────────────────────────────────

  /// GET /api/trips/incidents/me/by-trips?ids=...&ids=...
  /// Devuelve un mapa { tripId: Incident | null } solo con las incidencias
  /// reportadas por el USUARIO ACTUAL (no las del otro lado del viaje).
  /// Si el viaje no tiene incidencia mía, el valor es null.
  Future<Map<String, Incident?>> getMyIncidentsByTrips(
      List<String> tripIds) async {
    if (tripIds.isEmpty) return {};
    final params = tripIds.map((id) => 'ids=$id').join('&');
    final json = await _api.get(
      '${ApiConfig.trips}/trips/incidents/me/by-trips?$params',
    );
    final map = json as Map<String, dynamic>;
    final result = <String, Incident?>{};
    map.forEach((tripId, value) {
      result[tripId] =
          value == null ? null : Incident.fromJson(value as Map<String, dynamic>);
    });
    return result;
  }

  /// POST /api/trips/incidents/{tripId}
  /// El usuario reporta una incidencia sobre un viaje propio.
  Future<Incident> reportIncident(String tripId, String description) async {
    final json = await _api.post(
      '${ApiConfig.trips}/trips/incidents/$tripId',
      body: {'description': description},
    );
    return Incident.fromJson(json as Map<String, dynamic>);
  }

  // ─── Calificaciones (rating) ────────────────────────────────────────────

  /// POST /api/trips/ratings/{tripId}
  /// El pasajero califica al conductor con 1-5 estrellas + comentario opcional.
  /// El backend rechaza con 409 si el viaje ya fue calificado o si no está
  /// completado.
  Future<Rating> rateTrip(String tripId, int stars, String? comment) async {
    final json = await _api.post(
      '${ApiConfig.trips}/trips/ratings/$tripId',
      body: {
        'stars': stars,
        if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
      },
    );
    return Rating.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/trips/ratings/trip/{tripId}
  /// Devuelve la calificación del viaje o null si aún no fue calificado.
  /// Usado por el historial del pasajero para mostrar "Calificar" o estrellas.
  Future<Rating?> getTripRating(String tripId) async {
    final json = await _api.get(
      '${ApiConfig.trips}/trips/ratings/trip/$tripId',
    );
    if (json == null) return null;
    return Rating.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/trips/ratings/me/by-trips?ids=...
  /// Versión batch: trae las calificaciones de varios viajes en una sola llamada.
  /// El backend devuelve un Map {tripId → rating}. Los viajes sin calificación
  /// NO están en el resultado, así que para hacer el lookup uniforme rellenamos
  /// los faltantes con null en el cliente.
  Future<Map<String, Rating?>> getRatingsByTrips(List<String> tripIds) async {
    if (tripIds.isEmpty) return {};
    final qs = tripIds.map((id) => 'ids=$id').join('&');
    final json = await _api.get('${ApiConfig.trips}/trips/ratings/me/by-trips?$qs');
    final map = (json as Map<String, dynamic>?) ?? {};
    final result = <String, Rating?>{};
    // Inicializo todos los pedidos como null y luego sobreescribo los presentes.
    for (final id in tripIds) {
      result[id] = null;
    }
    map.forEach((tripId, value) {
      if (value != null) {
        result[tripId] = Rating.fromJson(value as Map<String, dynamic>);
      }
    });
    return result;
  }

  /// GET /api/trips/ratings/me?page=1&pageSize=10
  /// El conductor logueado obtiene sus calificaciones recibidas.
  Future<RatingPage> getMyRatings({int page = 1, int pageSize = 10}) async {
    final json = await _api.get(
      '${ApiConfig.trips}/trips/ratings/me?page=$page&pageSize=$pageSize',
    );
    return RatingPage.fromJson(json as Map<String, dynamic>);
  }

  /// GET /api/trips/ratings/me/summary
  /// Resumen de MI calificación. Conductor: promedio y cantidad.
  /// Pasajero: ratingsAvailable=false (no existe calificación de pasajeros).
  Future<({bool available, double? rating, int count})>
      getMyRatingSummary() async {
    final json = await _api.get('${ApiConfig.trips}/trips/ratings/me/summary');
    final j = (json as Map<String, dynamic>?) ?? const {};
    return (
      available: j['ratingsAvailable'] == true,
      rating: (j['myRating'] as num?)?.toDouble(),
      count: (j['myRatingCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Resultado de aplicar un cupon a un viaje.
class CouponApplied {
  final String   tripId;
  final String   code;
  final String   itemName;
  final double   fareBeforeDiscount;
  final double   discountAmount;
  final double   amountToPay;
  /// Aviso cuando se aplico menos de lo que valia el cupon.
  final String?  warning;

  CouponApplied({
    required this.tripId,
    required this.code,
    required this.itemName,
    required this.fareBeforeDiscount,
    required this.discountAmount,
    required this.amountToPay,
    this.warning,
  });

  factory CouponApplied.fromJson(Map<String, dynamic> j) => CouponApplied(
        tripId:             j['tripId'].toString(),
        code:               (j['code'] ?? '').toString(),
        itemName:           (j['itemName'] ?? 'Cupón').toString(),
        fareBeforeDiscount: (j['fareBeforeDiscount'] as num?)?.toDouble() ?? 0,
        discountAmount:     (j['discountAmount']     as num?)?.toDouble() ?? 0,
        amountToPay:        (j['amountToPay']        as num?)?.toDouble() ?? 0,
        warning:            j['warning']?.toString(),
      );
}
