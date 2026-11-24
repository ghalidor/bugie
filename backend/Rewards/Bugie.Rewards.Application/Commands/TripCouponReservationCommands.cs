using MediatR;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Commands;

/* ──────────────────────────────────────────────────────────────────────────
   Reserva del cupón en un viaje.

   Al aplicar un cupón, Trips pide reservarlo para ese viaje: queda 'reserved'
   y nadie más lo puede usar (ni el mismo pasajero en otro viaje). No vence ni
   se anula mientras esté reservado. Al completar el viaje se consume
   (UseTripCouponCommand); al quitarlo o cancelar el viaje se libera.
   ────────────────────────────────────────────────────────────────────────── */

/// <summary>
/// Valida el cupón para ese viaje y, si sirve, lo reserva (atómico). Devuelve
/// lo mismo que la validación; si otro viaje se adelantó, Valid = false con
/// el motivo.
/// </summary>
public record ReserveTripCouponCommand(string Code, Guid UserId, Guid TripId, decimal Fare)
    : IRequest<CouponValidationDto>;

public class ReserveTripCouponHandler : IRequestHandler<ReserveTripCouponCommand, CouponValidationDto>
{
    private readonly IRedemptionRepository _redemptions;
    private readonly IMediator             _mediator;

    public ReserveTripCouponHandler(IRedemptionRepository redemptions, IMediator mediator)
        => (_redemptions, _mediator) = (redemptions, mediator);

    public async Task<CouponValidationDto> Handle(ReserveTripCouponCommand cmd, CancellationToken ct)
    {
        var code = (cmd.Code ?? string.Empty).Trim().ToUpperInvariant();

        var v = await _mediator.Send(
            new ValidateCouponForTripQuery(code, cmd.UserId, cmd.Fare, cmd.TripId), ct);
        if (!v.Valid) return v;

        var cupon = await _redemptions.GetByCodeAsync(code, ct);
        if (cupon is not null && await _redemptions.TryReserveAsync(cupon.Id, cmd.UserId, cmd.TripId, ct))
            return v;

        // Otro proceso cambió el cupón entre la validación y la reserva
        // (p. ej. se aplicó a la vez en dos viajes): se informa el motivo real.
        var ahora = await _redemptions.GetByCodeAsync(code, ct);
        var motivo = ahora?.Status switch
        {
            RedemptionStatus.Reserved  => ValidateCouponForTripHandler.AlreadyAppliedElsewhere,
            RedemptionStatus.Used      => "Ese cupón ya se usó.",
            RedemptionStatus.Cancelled => "Ese cupón fue anulado.",
            RedemptionStatus.Expired   => "Ese cupón ya venció.",
            _                          => "Ese cupón no se puede usar ahora. Inténtalo de nuevo.",
        };
        return new CouponValidationDto(false, null, null, null, 0, 0, motivo, null);
    }
}

/// <summary>
/// Libera la reserva del cupón en ese viaje (se quitó o el viaje se canceló).
/// Idempotente: si ya no estaba reservado para ese viaje, no hace nada.
/// RequestedAtUtc: momento en que Trips quitó el cupón; una reserva hecha
/// después (lo volvió a aplicar) no se libera con un aviso viejo.
/// Devuelve el estado nuevo ('active' / 'expired') o null si no cambió nada.
/// </summary>
public record ReleaseTripCouponCommand(string Code, Guid TripId, DateTime? RequestedAtUtc)
    : IRequest<string?>;

public class ReleaseTripCouponHandler : IRequestHandler<ReleaseTripCouponCommand, string?>
{
    private readonly IRedemptionRepository _redemptions;
    public ReleaseTripCouponHandler(IRedemptionRepository redemptions) => _redemptions = redemptions;

    public Task<string?> Handle(ReleaseTripCouponCommand cmd, CancellationToken ct) =>
        _redemptions.ReleaseAsync(
            (cmd.Code ?? string.Empty).Trim().ToUpperInvariant(), cmd.TripId, cmd.RequestedAtUtc, ct);
}
