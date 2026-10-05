using MediatR;
using Microsoft.Extensions.Options;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Application.Options;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public class GetPendingTripsHandler : IRequestHandler<GetPendingTripsQuery, List<TripDto>>
{
    private readonly ITripRepository _trips;
    private readonly ITripProposalRepository _proposals;
    private readonly IDriversClient _drivers;
    private readonly ILandingClient _landing;
    private readonly IAuthClient _auth;
    private readonly ITripPhotoRepository _photos;
    private readonly TripFilteringOptions _options;
    private readonly ProposalExpirationWindowOptions _expiration;

    public GetPendingTripsHandler(
        ITripRepository trips,
        ITripProposalRepository proposals,
        IDriversClient drivers,
        ILandingClient landing,
        IAuthClient auth,
        ITripPhotoRepository photos,
        IOptions<TripFilteringOptions> options,
        IOptions<ProposalExpirationWindowOptions> expiration)
    {
        _trips = trips;
        _proposals = proposals;
        _drivers = drivers;
        _landing = landing;
        _auth = auth;
        _photos = photos;
        _options = options.Value;
        _expiration = expiration.Value;
    }

    public async Task<List<TripDto>> Handle(GetPendingTripsQuery q, CancellationToken ct)
    {
        // 1. Traer posición actual del conductor.
        //    Si no la tenemos (acaba de conectarse, sin GPS), devolvemos
        //    lista vacía: regla decidida con el cliente.
        //    Los ENVIOS no dependen de la posicion (le llegan a todos los
        //    conductores), asi que sin GPS se siguen mostrando.
        var driverLoc = await _drivers.GetDriverLocationByUserIdAsync(q.DriverUserId, ct);

        // 2. TripIds donde el conductor ya envió propuesta no-rejected.
        //    Estos viajes los vemos siempre, aunque estén fuera del radio.
        var withProposalIds = await _proposals.GetTripIdsWithActiveProposalAsync(
            q.DriverUserId, ct);
        var withProposalSet = withProposalIds.ToHashSet();

        // 3. Traer todos los pending (regla previa) y filtrar en memoria.
        //    Para escala objetivo (~100 pending pico), filtrar en memoria
        //    es trivial (<1ms). Si crece mucho, conviene índice espacial SQL.
        var all = await _trips.GetPendingAsync(ct);

        // Radio: el ADMIN lo configura desde el panel (landing.SystemSettings ?
        // max_radius_km). Si Landing está caído o el setting no existe,
        // caemos al valor de appsettings.json (TripFiltering.NearbyRadiusMeters)
        // para no dejar a los conductores sin ver viajes.
        var radius = await _landing.GetMaxRadiusMetersAsync(
            _options.NearbyRadiusMeters, ct);

        var visible = new List<Bugie.Trips.Domain.Entities.Trip>();
        foreach(var trip in all)
        {
            // Envio sin fotos del paquete todavia: no se muestra (se estan guardando).
            if(trip.ServiceType == Bugie.Trips.Domain.Enums.ServiceType.Delivery &&
               !(await _photos.GetByTripAsync(trip.Id, ct)).Any(p => p.Kind == Bugie.Trips.Domain.Enums.TripPhotoKind.RequestPackage))
                continue;

            // Excepción: el conductor ya negoció este viaje ? mostrar siempre
            if(withProposalSet.Contains(trip.Id))
            {
                visible.Add(trip);
                continue;
            }

            // Envios: a TODOS los conductores conectados, sin filtro de distancia.
            if(trip.ServiceType == Bugie.Trips.Domain.Enums.ServiceType.Delivery)
            {
                visible.Add(trip);
                continue;
            }

            // Viajes: filtrar por distancia (sin GPS no se muestran)
            if(driverLoc is null) continue;
            var dist = HaversineMeters(
                driverLoc.Lat, driverLoc.Lng,
                trip.OriginLat, trip.OriginLng);

            if(dist <= radius)
                visible.Add(trip);
        }

        // Mapa de demanda: solo hace falta la lista visible (sin datos del pasajero).
        if(q.SkipDetails)
            return visible.Select(t => CreateTripHandler.ToDto(t)).ToList();

        // 4. Traer datos de los pasajeros (nombre + foto) para mostrarlos
        //    en la solicitud del conductor.
        var passengerIds = visible.Select(t => t.PassengerId).Distinct().ToList();
        var passengers = await _auth.GetUsersByIdsAsync(passengerIds, ct);

        // 5. Adjuntar waypoints y mapear a DTO
        var result = new List<TripDto>();
        foreach(var trip in visible)
        {
            var waypoints = await _trips.GetWaypointsAsync(trip.Id, ct);
            var wpDtos = waypoints
                .OrderBy(w => w.SortOrder)
                .Select(w => new WaypointDto(w.Id, w.Address, w.Lat, w.Lng, w.SortOrder))
                .ToList();
            var pax = passengers.GetValueOrDefault(trip.PassengerId);
            var dto = CreateTripHandler.ToDto(trip, wpDtos,
                passengerName: pax?.FullName,
                passengerPhotoUrl: pax?.ProfilePhotoUrl);
            dto = dto with
            {
                PassengerShortName = TripDto.BuildPassengerShortName(pax?.FirstNames, pax?.LastNamePaternal)
            };

            // Datos agregados (no cambian los campos existentes):
            // oferta vigente del pasajero hacia ESTE conductor y vencimiento.
            decimal? passengerCounter = null;
            DateTime? expiresAt = null;
            string? expiresReason = null;

            if(withProposalSet.Contains(trip.Id))
            {
                // Historial entre este conductor y el viaje, mas reciente primero.
                var history = await _proposals.GetHistoryByDriverAsync(trip.Id, q.DriverUserId, ct);

                // Ultima contraoferta del pasajero hacia este conductor.
                passengerCounter = history
                    .FirstOrDefault(h => h.ProposedByRole == "passenger")?.Fare;

                // Regla real (ProposalExpirationService): la propuesta aceptada por
                // el pasajero vence CreatedAt + ExpireAfterMinutes si el conductor
                // no la confirma.
                var waiting = history.FirstOrDefault(h => h.Status == "accepted_by_passenger");
                if(waiting is not null)
                {
                    expiresAt = AsUtc(waiting.CreatedAt).AddMinutes(_expiration.ExpireAfterMinutes);
                    expiresReason = "proposal_confirm";
                }
            }

            // Regla real (ScheduledTripReminderService): un programado sin conductor
            // se cancela al llegar su hora (ScheduledAt).
            if(trip.ScheduledAt.HasValue && trip.DriverId is null)
            {
                var scheduledAt = AsUtc(trip.ScheduledAt.Value);
                if(expiresAt is null || scheduledAt < expiresAt)
                {
                    expiresAt = scheduledAt;
                    expiresReason = "scheduled_time";
                }
            }

            // PassengerRating / PassengerRatingCount quedan null: no existe
            // calificacion de pasajeros en el sistema.
            result.Add(passengerCounter.HasValue
                ? dto with { PassengerOfferFare = passengerCounter.Value, ExpiresAt = expiresAt, ExpiresReason = expiresReason }
                : dto with { ExpiresAt = expiresAt, ExpiresReason = expiresReason });
        }

        return result;
    }

    /// <summary>
    /// Distancia Haversine en metros entre dos puntos lat/lng.
    /// Suficientemente precisa para distancias urbanas (&lt;100 km).
    /// </summary>
    private static double HaversineMeters(double lat1, double lng1, double lat2, double lng2)
    {
        const double R = 6371000; // radio de la Tierra en metros
        var dLat = ToRad(lat2 - lat1);
        var dLng = ToRad(lng2 - lng1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
              + Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2))
              * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return R * c;
    }

    private static double ToRad(double deg) => deg * Math.PI / 180.0;

    // Las fechas de la base llegan como UTC; si no traen zona se asume UTC.
    private static DateTime AsUtc(DateTime d) =>
        d.Kind == DateTimeKind.Utc ? d : DateTime.SpecifyKind(d, DateTimeKind.Utc);
}