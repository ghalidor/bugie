using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Interfaces;
using Bugie.Drivers.Domain.External;

namespace Bugie.Drivers.Application.Queries;

public class GetDriversByStatusHandler : IRequestHandler<GetDriversByStatusQuery, List<DriverDto>>
{
    private readonly IDriverRepository _drivers;
    private readonly IAuthClient _auth;

    public GetDriversByStatusHandler(IDriverRepository drivers, IAuthClient auth)
    {
        _drivers = drivers;
        _auth = auth;
    }

    public async Task<List<DriverDto>> Handle(GetDriversByStatusQuery q, CancellationToken ct)
    {
        var list = await _drivers.GetByStatusAsync(q.Status, ct);
        if(list.Count == 0) return new List<DriverDto>();

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
            HasActiveTrip: false,
            d.CreatedAt,
            d.ApprovedAt,
            d.ProfilePhotoUrl
        )).ToList();
    }
}
