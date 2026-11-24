using System.Globalization;
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
   Al aplicarlo queda RESERVADO en Rewards para este viaje: nadie lo puede usar
   en otro viaje, no vence ni se anula mientras el viaje siga. Si se quita o el
   viaje se cancela, la reserva se libera y el cupón queda libre para otra vez.
   Consumirlo antes sería quitarle un premio a alguien por un viaje que nunca
   ocurrió.
   ────────────────────────────────────────────────────────────────────────── */

public record ApplyCouponCommand(Guid TripId, Guid PassengerId, string Code)
    : IRequest<CouponAppliedDto>;

/// <param name="Warning">Aviso cuando se aplicó menos de lo que valía el cupón.</param>
/// <param name="LeftoverSoles">Cupón de monto que vale más que la tarifa: lo que sobra (0 si nada).</param>
/// <param name="LeftoverPoints">Ese sobrante en puntos, que se devuelven al completar el viaje.</param>
/// <param name="Notice">Texto listo para mostrar al pasajero cuando hay sobrante.</param>
public record CouponAppliedDto(
    Guid     TripId,
    string   Code,
    string   ItemName,
    decimal  FareBeforeDiscount,
    decimal  DiscountAmount,
    decimal  AmountToPay,
    string?  Warning,
    decimal  LeftoverSoles  = 0,
    int      LeftoverPoints = 0,
    string?  Notice         = null);

public class ApplyCouponHandler : IRequestHandler<ApplyCouponCommand, CouponAppliedDto>
{
    private readonly ITripRepository   _trips;
    private readonly IRewardsClient    _rewards;
    private readonly IOutboxRepository _outbox;

    public ApplyCouponHandler(ITripRepository trips, IRewardsClient rewards, IOutboxRepository outbox)
    {
        _trips   = trips;
        _rewards = rewards;
        _outbox  = outbox;
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

        // La tarifa acordada. Al aceptarse una oferta, EstimatedFare pasa a ser
        // ese precio; ProposedFare puede quedar con una oferta vieja.
        var tarifa = trip.EstimatedFare;
        if (tarifa <= 0)
            throw new InvalidOperationException("Este viaje todavía no tiene precio.");

        // Rewards decide: si el interruptor está apagado, si el cupón es suyo,
        // si venció, si ya está aplicado a otro viaje, y cuánto descuenta de
        // verdad. Si sirve, lo deja reservado para este viaje (atómico).
        var v = await _rewards.ReserveCouponAsync(
            cmd.Code.Trim().ToUpperInvariant(), cmd.PassengerId, trip.Id, tarifa, ct);

        if (v is null)
            throw new InvalidOperationException(
                "No se pudo verificar el cupón en este momento. Inténtalo de nuevo.");

        if (!v.Valid)
            throw new InvalidOperationException(v.Reason ?? "Ese cupón no se puede usar.");

        // Cupón de monto que vale más que el viaje: queda gratis y el sobrante
        // vuelve en puntos al completar. Se guarda en el viaje para mostrarlo
        // en el resumen; Rewards acredita de verdad al completar.
        try
        {
            trip.ApplyCoupon(v.Code!, v.DiscountAmount, tarifa, v.LeftoverSoles, v.LeftoverPoints);
            await _trips.UpdateAsync(trip, ct);
        }
        catch
        {
            // El viaje no quedó con el cupón: se suelta la reserva para no
            // dejarlo bloqueado.
            await CouponReservation.ReleaseAsync(_rewards, _outbox, trip.Id, v.Code, CancellationToken.None);
            throw;
        }

        string? aviso = v.LeftoverPoints > 0
            ? $"Este viaje te sale gratis. Te devolvemos S/ {v.LeftoverSoles.ToString("0.00", CultureInfo.InvariantCulture)} " +
              $"en puntos ({v.LeftoverPoints} pts) al terminar."
            : null;

        return new CouponAppliedDto(
            trip.Id, v.Code!, v.ItemName ?? "Cupón",
            tarifa, v.DiscountAmount, tarifa - v.DiscountAmount, v.Warning,
            v.LeftoverPoints > 0 ? v.LeftoverSoles : 0, v.LeftoverPoints, aviso);
    }
}

/// <summary>Quita el cupón. Como no se consumió, se libera su reserva y vuelve a estar disponible.</summary>
public record RemoveCouponCommand(Guid TripId, Guid PassengerId) : IRequest<Unit>;

public class RemoveCouponHandler : IRequestHandler<RemoveCouponCommand, Unit>
{
    private readonly ITripRepository   _trips;
    private readonly IRewardsClient    _rewards;
    private readonly IOutboxRepository _outbox;

    public RemoveCouponHandler(ITripRepository trips, IRewardsClient rewards, IOutboxRepository outbox)
        => (_trips, _rewards, _outbox) = (trips, rewards, outbox);

    public async Task<Unit> Handle(RemoveCouponCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");

        if (trip.PassengerId != cmd.PassengerId)
            throw new UnauthorizedAccessException("Este viaje no es tuyo.");

        if (trip.Status is TripStatus.Completed or TripStatus.Cancelled)
            throw new InvalidOperationException(
                "El viaje ya terminó: el cupón no se puede quitar.");

        var code = trip.CouponCode;
        trip.RemoveCoupon();
        await _trips.UpdateAsync(trip, ct);

        await CouponReservation.ReleaseAsync(_rewards, _outbox, trip.Id, code, ct);
        return Unit.Value;
    }
}
