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

        var reason = string.IsNullOrWhiteSpace(cmd.Reason) ? null : cmd.Reason.Trim();
        if (reason is { Length: > 200 }) reason = reason[..200];

        trip.Cancel(cmd.CancelledBy, reason);
        await _trips.UpdateAsync(trip, ct);
        return CreateTripHandler.ToDto(trip);
    }
}
