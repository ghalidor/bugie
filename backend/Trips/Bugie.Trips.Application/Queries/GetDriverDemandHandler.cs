using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public class GetDriverDemandHandler : IRequestHandler<GetDriverDemandQuery, DriverDemandDto>
{
    /// <summary>Ventana de la demanda reciente (minutos).</summary>
    private const int DemandWindowMinutes = 30;
    private const int MaxNearby = 10;

    private readonly ITripRepository _trips;
    private readonly IMediator _mediator;

    public GetDriverDemandHandler(ITripRepository trips, IMediator mediator)
    {
        _trips = trips;
        _mediator = mediator;
    }

    public async Task<DriverDemandDto> Handle(GetDriverDemandQuery q, CancellationToken ct)
    {
        // 1. Zonas: agrupado en SQL (celdas de ~500 m dentro del radio).
        var zones = await _trips.GetDemandZonesAsync(
            q.Lat, q.Lng, q.RadiusKm * 1000, DemandWindowMinutes, ct);

        // 2. Cercanas: la MISMA lista que ve el conductor en sus solicitudes
        //    (radio para viajes, envios a todos, propuestas en curso, etc.),
        //    sin pedir datos del pasajero ni waypoints.
        var visible = await _mediator.Send(new GetPendingTripsQuery(q.DriverUserId, SkipDetails: true), ct);

        var nearby = visible
            .Select(t => new DemandNearbyDto(
                t.Id, t.ServiceType,
                t.OriginLat, t.OriginLng,
                t.OriginAddress, t.DestAddress,
                t.EstimatedFare,
                Math.Round(HaversineKm(q.Lat, q.Lng, t.OriginLat, t.OriginLng), 2),
                t.CreatedAt))
            .OrderBy(n => n.DistanceKm)
            .Take(MaxNearby)
            .ToList();

        // Fechas en UTC: el JSON las devuelve en hora de Peru (PeruDateTimeJsonConverter).
        return new DriverDemandDto(
            DateTime.UtcNow,
            zones.Select(z => new DemandZoneDto(z.Lat, z.Lng, z.Count, z.Deliveries, z.Trips)).ToList(),
            nearby);
    }

    private static double HaversineKm(double lat1, double lng1, double lat2, double lng2)
    {
        const double R = 6371.0; // km
        var dLat = (lat2 - lat1) * Math.PI / 180.0;
        var dLng = (lng2 - lng1) * Math.PI / 180.0;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
              + Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0)
              * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }
}
