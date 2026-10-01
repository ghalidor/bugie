using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public class CancelTripHandler : IRequestHandler<CancelTripCommand, TripDto>
{
    private readonly ITripRepository _trips;
    public CancelTripHandler(ITripRepository trips) => _trips = trips;

    public async Task<TripDto> Handle(CancelTripCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");
        trip.Cancel("passenger");
        await _trips.UpdateAsync(trip, ct);
        return CreateTripHandler.ToDto(trip);
    }
}
