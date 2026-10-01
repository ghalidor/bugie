import 'package:latlong2/latlong.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/incident_model.dart';
import '../domain/proposal_model.dart';
import '../domain/rating_model.dart';
import '../domain/route_model.dart';
import '../domain/trip_model.dart';

/// Repositorio de viajes (puerto 5002).
/// Lo usan tanto el módulo passenger como driver.
class TripsRepository {
  final ApiClient _api;
  TripsRepository(this._api);

  // ── Pasajero ─────────────────────────────────────────────────────────────

  /// POST /api/trips
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
    // ---- Envío (Delivery) ----
    bool isDelivery = false,
    String? packageDescription,
    double? packageWeightKg,
    bool packageIsFragile = false,
    String? packageDetails,
  }) async {
    final json = await _api.post('${ApiConfig.trips}/trips', body: {
      'originAddress': originAddress,
      'originLat': originLat,
      'originLng': originLng,
      'destAddress': destAddress,
      'destLat': destLat,
      'destLng': destLng,
      'estimatedFare': estimatedFare,
      'paymentMethod': paymentMethod,
      'waypoints': waypoints.map((w) => w.toJson()).toList(),
      'serviceType': isDelivery ? 1 : 0,
      'packageDescription': packageDescription,
      'packageWeightKg': packageWeightKg,
      'packageIsFragile': packageIsFragile,
      'packageDetails': packageDetails,
    });
    return Trip.fromJson(json as Map<String, dynamic>);
  }

  /// POST /api/trips/{id}/package-photos — el cliente sube fotos del paquete.
  Future<void> uploadPackagePhotos(String tripId, List<String> paths) async {
    if (paths.isEmpty) return;
    await _api.postMultipartMany(
      '${ApiConfig.trips}/trips/$tripId/package-photos',
      files: [for (final p in paths) MapEntry('files', p)],
    );
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
  Future<void> cancel(String tripId) async {
    await _api.put('${ApiConfig.trips}/trips/$tripId/cancel');
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

  /// PUT /api/trips/{id}/start
  Future<Trip> start(String tripId) async {
    final json = await _api.put('${ApiConfig.trips}/trips/$tripId/start');
    return Trip.fromJson(json as Map<String, dynamic>);
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
}
