using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public class CancelTripHandler : IRequestHandler<CancelTripCommand, TripDto>
{
    private readonly ITripRepository   _trips;
    private readonly IRewardsClient    _rewards;
    private readonly IOutboxRepository _outbox;

    public CancelTripHandler(ITripRepository trips, IRewardsClient rewards, IOutboxRepository outbox)
        => (_trips, _rewards, _outbox) = (trips, rewards, outbox);

    public async Task<TripDto> Handle(CancelTripCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");

        var reason = string.IsNullOrWhiteSpace(cmd.Reason) ? null : cmd.Reason.Trim();
        if (reason is { Length: > 200 }) reason = reason[..200];

        trip.Cancel(cmd.CancelledBy, reason);
        await _trips.UpdateAsync(trip, ct);

        // Viaje cancelado con cupon: la reserva se libera (vuelve a estar
        // disponible, o vencido si ya paso su fecha).
        if (trip.HasCoupon)
            await CouponReservation.ReleaseAsync(_rewards, _outbox, trip.Id, trip.CouponCode, ct);

        return CreateTripHandler.ToDto(trip);
    }
}
