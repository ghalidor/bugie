using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

using MediatR;

namespace Bugie.Drivers.Application.Queries;

public class GetAllDriversHandler : IRequestHandler<GetAllDriversQuery, List<DriverDto>>
{
    private readonly IDriverRepository _drivers;
    private readonly IAuthClient _auth;

    public GetAllDriversHandler(IDriverRepository drivers, IAuthClient auth)
    {
        _drivers = drivers;
        _auth = auth;
    }

    public async Task<List<DriverDto>> Handle(GetAllDriversQuery q, CancellationToken ct)
    {
        var list = await _drivers.GetAllAsync(ct);
        if(list.Count == 0) return new List<DriverDto>();

        // Pide nombres a Auth.Api (HTTP)
        var users = await _auth.GetUsersByIdsAsync(list.Select(d => d.UserId), ct);

        return list.Select(d => new DriverDto(
            d.Id,
            d.UserId,
            users.GetValueOrDefault(d.UserId)?.FullName ?? "Conductor",
            d.Status,
            d.IsOnline,
            d.CurrentLat,
            d.CurrentLng,
            d.Rating,
            d.TotalRatings,
            HasActiveTrip: false,  // no aplica para vista "todos"
            d.CreatedAt,
            d.ApprovedAt,
            d.ProfilePhotoUrl
        )).ToList();
    }
}
