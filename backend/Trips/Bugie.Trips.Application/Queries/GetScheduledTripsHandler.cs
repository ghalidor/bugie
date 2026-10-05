using MediatR;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Programados vigentes del usuario (pendientes, negociando o aceptados),
/// ordenados por hora programada. El pasajero ve los suyos; el conductor
/// los que tiene asignados (lista "Programados" de la app).
/// </summary>
public record GetScheduledTripsQuery(Guid UserId) : IRequest<List<TripDto>>;

public class GetScheduledTripsHandler : IRequestHandler<GetScheduledTripsQuery, List<TripDto>>
{
    private readonly ITripRepository _trips;
    private readonly IAuthClient _auth;

    public GetScheduledTripsHandler(ITripRepository trips, IAuthClient auth)
    {
        _trips = trips;
        _auth = auth;
    }

    public async Task<List<TripDto>> Handle(GetScheduledTripsQuery q, CancellationToken ct)
    {
        var list = await _trips.GetScheduledByUserAsync(q.UserId, ct);
        if(list.Count == 0) return new List<TripDto>();

        // Nombres y fotos de pasajero y conductor (una sola llamada a Auth).
        var ids = list.Select(t => t.PassengerId)
            .Concat(list.Where(t => t.DriverId.HasValue).Select(t => t.DriverId!.Value))
            .Distinct().ToList();
        var users = await _auth.GetUsersByIdsAsync(ids, ct);

        var result = new List<TripDto>();
        foreach(var t in list)
        {
            var waypoints = await _trips.GetWaypointsAsync(t.Id, ct);
            var wpDtos = waypoints.OrderBy(w => w.SortOrder)
                .Select(w => new WaypointDto(w.Id, w.Address, w.Lat, w.Lng, w.SortOrder)).ToList();
            var pax = users.GetValueOrDefault(t.PassengerId);
            var drv = t.DriverId.HasValue ? users.GetValueOrDefault(t.DriverId.Value) : null;
            result.Add(CreateTripHandler.ToDto(t, wpDtos,
                passengerName: pax?.FullName,
                passengerPhotoUrl: pax?.ProfilePhotoUrl,
                driverName: drv?.FullName,
                driverPhotoUrl: drv?.ProfilePhotoUrl));
        }
        return result;
    }
}
