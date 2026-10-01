using MediatR;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

/* ──────────────────────────────────────────────────────────────────────────
   Cupones sobre la tarifa.

   El pasajero aplica un cupón a un viaje que ya tiene precio. El descuento
   baja lo que va a pagar, y el conductor lo ve al revisar el viaje.

   El interruptor vive en Rewards, no acá: es donde están todas las demás
   perillas del programa de puntos, y así hay una sola fuente de verdad.
   Rewards responde "no se puede" y Trips no toca nada.

   Importante: el cupón NO se consume al aplicarlo, sino al completar el viaje.
   Si el viaje se cancela, el cupón queda libre para otra vez. Consumirlo antes
   sería quitarle un premio a alguien por un viaje que nunca ocurrió.
   ────────────────────────────────────────────────────────────────────────── */

public record ApplyCouponCommand(Guid TripId, Guid PassengerId, string Code)
    : IRequest<CouponAppliedDto>;

public record CouponAppliedDto(
    Guid     TripId,
    string   Code,
    string   ItemName,
    decimal  FareBeforeDiscount,
    decimal  DiscountAmount,
    decimal  AmountToPay,
    /// <summary>Aviso cuando se aplicó menos de lo que valía el cupón.</summary>
    string?  Warning);

public class ApplyCouponHandler : IRequestHandler<ApplyCouponCommand, CouponAppliedDto>
{
    /// <summary>Comisión de la plataforma. Igual que en Payments.Create.</summary>
    private const decimal PlatformFeeRate = 0.10m;

    private readonly ITripRepository _trips;
    private readonly IRewardsClient  _rewards;

    public ApplyCouponHandler(ITripRepository trips, IRewardsClient rewards)
    {
        _trips   = trips;
        _rewards = rewards;
    }

    public async Task<CouponAppliedDto> Handle(ApplyCouponCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");

        if (trip.PassengerId != cmd.PassengerId)
            throw new UnauthorizedAccessException("Este viaje no es tuyo.");

        // Solo entre que hay precio acordado y que el viaje termina. Antes no
        // hay tarifa que descontar; después ya se cobró.
        if (trip.Status is not (TripStatus.Accepted or TripStatus.InProgress))
            throw new InvalidOperationException(
                "Solo puedes usar un cupón en un viaje aceptado o en curso.");

        if (!string.IsNullOrWhiteSpace(trip.CouponCode))
            throw new InvalidOperationException(
                "Este viaje ya tiene un cupón aplicado. Quítalo primero si quieres cambiarlo.");

        // La tarifa vigente: la que el conductor propuso si hubo negociación.
        var tarifa = trip.ProposedFare ?? trip.EstimatedFare;
        if (tarifa <= 0)
            throw new InvalidOperationException("Este viaje todavía no tiene precio.");

        var comision = Math.Round(tarifa * PlatformFeeRate, 2);

        // Rewards decide: si el interruptor está apagado, si el cupón es suyo,
        // si venció, y cuánto descuenta de verdad.
        var v = await _rewards.ValidateCouponAsync(
            cmd.Code.Trim().ToUpperInvariant(), cmd.PassengerId, tarifa, comision, ct);

        if (v is null)
            throw new InvalidOperationException(
                "No se pudo verificar el cupón en este momento. Inténtalo de nuevo.");

        if (!v.Valid)
            throw new InvalidOperationException(v.Reason ?? "Ese cupón no se puede usar.");

        trip.ApplyCoupon(v.Code!, v.DiscountAmount, tarifa, v.OwedToDriver);
        await _trips.UpdateAsync(trip, ct);

        return new CouponAppliedDto(
            trip.Id, v.Code!, v.ItemName ?? "Cupón",
            tarifa, v.DiscountAmount, tarifa - v.DiscountAmount, v.Warning);
    }
}

/// <summary>Quita el cupón. Como no se consumió, vuelve a estar disponible.</summary>
public record RemoveCouponCommand(Guid TripId, Guid PassengerId) : IRequest<Unit>;

public class RemoveCouponHandler : IRequestHandler<RemoveCouponCommand, Unit>
{
    private readonly ITripRepository _trips;
    public RemoveCouponHandler(ITripRepository trips) => _trips = trips;

    public async Task<Unit> Handle(RemoveCouponCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");

        if (trip.PassengerId != cmd.PassengerId)
            throw new UnauthorizedAccessException("Este viaje no es tuyo.");

        if (trip.Status is TripStatus.Completed or TripStatus.Cancelled)
            throw new InvalidOperationException(
                "El viaje ya terminó: el cupón no se puede quitar.");

        trip.RemoveCoupon();
        await _trips.UpdateAsync(trip, ct);
        return Unit.Value;
    }
}
