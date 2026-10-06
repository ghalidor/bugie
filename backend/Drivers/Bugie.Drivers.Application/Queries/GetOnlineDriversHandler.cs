using MediatR;
using Microsoft.Extensions.Options;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Application.Services.Location;
using Bugie.Drivers.Domain.Enums;
using Bugie.Drivers.Domain.Interfaces;
using Bugie.Drivers.Domain.External;

namespace Bugie.Drivers.Application.Queries;

public class GetOnlineDriversHandler : IRequestHandler<GetOnlineDriversQuery, List<DriverDto>>
{
    private readonly IDriverRepository _drivers;
    private readonly IAuthClient _auth;
    private readonly ITripsClient _trips;
    private readonly DriverLiveLocations _live;
    private readonly LocationOptions _opts;

    public GetOnlineDriversHandler(
        IDriverRepository drivers, IAuthClient auth, ITripsClient trips,
        DriverLiveLocations live, IOptions<LocationOptions> opts)
    {
        _drivers = drivers;
        _auth = auth;
        _trips = trips;
        _live = live;
        _opts = opts.Value;
    }

    public async Task<List<DriverDto>> Handle(GetOnlineDriversQuery q, CancellationToken ct)
    {
        // 1) Solo BD propia (sin JOIN cross-database)
        var drivers = await _drivers.GetOnlineAsync(ct);
        if(drivers.Count == 0) return new List<DriverDto>();

        var userIds = drivers.Select(d => d.UserId).ToList();

        // 2) Auth y Trips en paralelo (HTTP)
        var usersTask = _auth.GetUsersByIdsAsync(userIds, ct);
        var activeTask = _trips.GetDriversWithActiveTripAsync(userIds, ct);
        await Task.WhenAll(usersTask, activeTask);

        var users = await usersTask;
        var activeIds = await activeTask;

        // 3) Combina en memoria. La posicion preferida es la que esta en
        //    memoria (DriverLiveLocations, mas fresca que la base); si no hay,
        //    la de la base.
        var maxAge = TimeSpan.FromMinutes(_opts.StaleMinutes);
        return drivers.Select(d => new DriverDto(
            d.Id,
            d.UserId,
            users.GetValueOrDefault(d.UserId)?.FullName ?? "Conductor",
            d.Status,
            d.IsOnline,
            _live.Get(d.UserId, maxAge)?.Lat ?? d.CurrentLat,
            _live.Get(d.UserId, maxAge)?.Lng ?? d.CurrentLng,
            d.Rating,
            d.TotalRatings,
            activeIds.Contains(d.UserId),
            d.CreatedAt,
            d.ApprovedAt,
            d.ProfilePhotoUrl
        )).ToList();
    }
}
