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
    private readonly TripFilteringOptions _options;

    public GetPendingTripsHandler(
        ITripRepository trips,
        ITripProposalRepository proposals,
        IDriversClient drivers,
        ILandingClient landing,
        IAuthClient auth,
        IOptions<TripFilteringOptions> options)
    {
        _trips = trips;
        _proposals = proposals;
        _drivers = drivers;
        _landing = landing;
        _auth = auth;
        _options = options.Value;
    }

    public async Task<List<TripDto>> Handle(GetPendingTripsQuery q, CancellationToken ct)
    {
        // 1. Traer posición actual del conductor.
        //    Si no la tenemos (acaba de conectarse, sin GPS), devolvemos
        //    lista vacía: regla decidida con el cliente.
        var driverLoc = await _drivers.GetDriverLocationByUserIdAsync(q.DriverUserId, ct);
        if(driverLoc is null)
            return new List<TripDto>();

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
            // Excepción: el conductor ya negoció este viaje ? mostrar siempre
            if(withProposalSet.Contains(trip.Id))
            {
                visible.Add(trip);
                continue;
            }

            // Caso normal: filtrar por distancia
            var dist = HaversineMeters(
                driverLoc.Lat, driverLoc.Lng,
                trip.OriginLat, trip.OriginLng);

            if(dist <= radius)
                visible.Add(trip);
        }

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
            result.Add(CreateTripHandler.ToDto(trip, wpDtos,
                passengerName: pax?.FullName,
                passengerPhotoUrl: pax?.ProfilePhotoUrl));
        }

        // DIAGNOSTICO TEMPORAL
        Console.WriteLine($"[PENDING_DEBUG] driverUserId={q.DriverUserId} | driverLoc=({driverLoc.Lat},{driverLoc.Lng}) | withProposalIds={withProposalIds.Count} | allPending={all.Count} | visible={visible.Count} | result={result.Count}");
        foreach(var id in withProposalIds)
            Console.WriteLine($"[PENDING_DEBUG] withProposalId: {id}");
        foreach(var t in all)
            Console.WriteLine($"[PENDING_DEBUG] pendingTrip: {t.Id} Status={t.Status} Origin=({t.OriginLat},{t.OriginLng})");

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
}