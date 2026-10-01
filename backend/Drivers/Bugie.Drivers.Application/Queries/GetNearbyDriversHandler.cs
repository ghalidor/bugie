using MediatR;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Queries;

public class GetNearbyDriversHandler : IRequestHandler<GetNearbyDriversQuery, List<NearbyDriverResponse>>
{
    private readonly IDriverRepository _drivers;
    public GetNearbyDriversHandler(IDriverRepository d) => _drivers = d;

    public async Task<List<NearbyDriverResponse>> Handle(GetNearbyDriversQuery q, CancellationToken ct)
    {
        var list = await _drivers.GetNearbyAsync(q.Lat, q.Lng, q.RadiusKm, q.MaxResults, ct);
        return list.Select(d => new NearbyDriverResponse(
            d.DriverId, d.UserId, d.Lat, d.Lng, d.DistanceKm,
            d.Rating, d.VehiclePlate, d.VehicleModel, d.VehicleColor)).ToList();
    }
}
