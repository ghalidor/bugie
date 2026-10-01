using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public class StartTripHandler : IRequestHandler<StartTripCommand, TripDto>
{
    private readonly ITripRepository _trips;
    public StartTripHandler(ITripRepository trips) => _trips = trips;

    public async Task<TripDto> Handle(StartTripCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");
        trip.Start();
        await _trips.UpdateAsync(trip, ct);
        var waypoints = await _trips.GetWaypointsAsync(trip.Id, ct);
        var wpDtos = waypoints.OrderBy(w => w.SortOrder)
            .Select(w => new WaypointDto(w.Id, w.Address, w.Lat, w.Lng, w.SortOrder)).ToList();
        return CreateTripHandler.ToDto(trip, wpDtos);
    }
}