using MediatR;
using Microsoft.Extensions.Options;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Application.Services.Location;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Queries;

/// <summary>
/// Conductores online cerca de un punto. La lista de candidatos (online,
/// aprobados, vehiculo) sale de la base; la posicion se toma de la memoria
/// (DriverLiveLocations) y solo si ahi no hay dato vigente se usa la de la base.
/// Misma respuesta que antes (distancia en km con 2 decimales, orden por distancia).
/// </summary>
public class GetNearbyDriversHandler : IRequestHandler<GetNearbyDriversQuery, List<NearbyDriverResponse>>
{
    private readonly IDriverRepository _drivers;
    private readonly DriverLiveLocations _live;
    private readonly LocationOptions _opts;

    public GetNearbyDriversHandler(IDriverRepository d, DriverLiveLocations live, IOptions<LocationOptions> opts)
        => (_drivers, _live, _opts) = (d, live, opts.Value);

    public async Task<List<NearbyDriverResponse>> Handle(GetNearbyDriversQuery q, CancellationToken ct)
    {
        var candidates = await _drivers.GetOnlineCandidatesAsync(ct);
        var maxAge = TimeSpan.FromMinutes(_opts.StaleMinutes);
        var result = new List<NearbyDriverResponse>(candidates.Count);

        foreach(var c in candidates)
        {
            var live = _live.Get(c.UserId, maxAge);
            var lat = live?.Lat ?? c.Lat;
            var lng = live?.Lng ?? c.Lng;
            if(lat is null || lng is null) continue;

            var km = Math.Round(DriverLiveLocations.Haversine(q.Lat, q.Lng, lat.Value, lng.Value) / 1000, 2);
            if(km > q.RadiusKm) continue;

            result.Add(new NearbyDriverResponse(
                c.DriverId, c.UserId, lat.Value, lng.Value, km,
                c.Rating, c.VehiclePlate, c.VehicleModel, c.VehicleColor));
        }

        return result.OrderBy(r => r.DistanceKm).Take(q.MaxResults).ToList();
    }
}
