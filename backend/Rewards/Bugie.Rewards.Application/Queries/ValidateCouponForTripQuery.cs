using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Constants;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// ¿Se puede usar este cupón en este viaje, y cuánto descuenta?
///
/// Lo pregunta Trips antes de tocar la tarifa. Responde siempre, con el motivo
/// cuando no se puede: así Trips le muestra al pasajero por qué, en vez de un
/// error genérico.
///
/// TripId (opcional): el viaje donde se quiere aplicar. Un cupón ya reservado
/// para ESE viaje se considera válido (reintento); reservado para otro, no.
/// </summary>
public record ValidateCouponForTripQuery(
    string  Code,
    Guid    UserId,
    decimal Fare,
    Guid?   TripId = null) : IRequest<CouponValidationDto>;

public class ValidateCouponForTripHandler
    : IRequestHandler<ValidateCouponForTripQuery, CouponValidationDto>
{
    private readonly IRedemptionRepository     _redemptions;
    private readonly IRewardSettingsRepository _settings;

    public ValidateCouponForTripHandler(
        IRedemptionRepository redemptions, IRewardSettingsRepository settings)
    {
        _redemptions = redemptions;
        _settings    = settings;
    }

    /// <summary>Tipos que descuentan sobre la tarifa. Los demás no aplican acá.</summary>
    private static readonly string[] AplicanATarifa =
        { "discount_amount", "free_trip", "discount_period" };

    public async Task<CouponValidationDto> Handle(
        ValidateCouponForTripQuery q, CancellationToken ct)
    {
        var options = RewardsOptions.From(await _settings.GetMapAsync(ct));

        if (!options.CouponsApplyToFare)
            return No("Los cupones todavía no se aplican a los viajes.");

        var cupon = await _redemptions.GetByCodeAsync(q.Code.Trim(), ct);
        if (cupon is null)
            return No("Ese código no existe.");

        if (cupon.UserId != q.UserId)
            return No("Ese cupón es de otra persona.");

        if (cupon.Status == RedemptionStatus.Used)
            return No("Ese cupón ya se usó.");

        if (cupon.Status == RedemptionStatus.Cancelled)
            return No("Ese cupón fue anulado.");

        // Reservado para este mismo viaje: es un reintento y no vence mientras
        // el viaje siga activo. Reservado para otro: no se puede.
        var reservadoAqui = q.TripId is Guid tripId && cupon.IsReservedFor(tripId);
        if (cupon.Status == RedemptionStatus.Reserved && !reservadoAqui)
            return No(AlreadyAppliedElsewhere);

        if (!reservadoAqui &&
            (cupon.Status == RedemptionStatus.Expired || cupon.ExpiresAt <= DateTime.UtcNow))
            return No("Ese cupón ya venció.");

        if (!AplicanATarifa.Contains(cupon.RewardType))
            return No("Ese premio no es un descuento de viaje: se entrega aparte.");

        if (q.Fare <= 0)
            return No("El viaje todavía no tiene un precio definido.");

        // Cuánto descuenta según el tipo.
        var bruto = cupon.RewardType switch
        {
            // Monto fijo, nunca más que el precio del viaje.
            "discount_amount" => Math.Min(cupon.AmountSoles ?? 0, q.Fare),

            // Viaje gratis hasta un tope: si el viaje cuesta menos, sale gratis.
            "free_trip"       => Math.Min(cupon.AmountSoles ?? 0, q.Fare),

            // Porcentaje sobre el precio.
            "discount_period" => Math.Round(q.Fare * (cupon.Percentage ?? 0) / 100m, 2),

            _ => 0m,
        };

        if (bruto <= 0)
            return No("Ese cupón no tiene un descuento configurado.");

        // Cupón de monto que vale más que el viaje: el viaje sale gratis y lo
        // que sobra vuelve como puntos al completarlo. Acá solo se calcula
        // para avisarle al pasajero antes; se acredita en UseTripCoupon.
        var sobranteSoles  = CouponLeftoverRules.LeftoverSoles(
            cupon.RewardType, cupon.AmountSoles, bruto);
        var sobrantePuntos = CouponLeftoverRules.ToPoints(
            sobranteSoles, options.RateFor(UserTypes.Passenger));

        // El descuento se aplica entero. La comisión se calcula después sobre
        // lo que de verdad se pagó, así que un cupón grande no deja al
        // conductor debiendo nada: simplemente cobra menos y la comisión de
        // ese viaje baja en la misma proporción.
        return new CouponValidationDto(
            Valid:          true,
            Code:           cupon.Code,
            ItemName:       cupon.ItemName,
            RewardType:     cupon.RewardType,
            DiscountAmount: bruto,
            FullDiscount:   bruto,
            Reason:         null,
            Warning:        null,
            // Si el sobrante no llega a 1 punto, no hay nada que devolver.
            LeftoverSoles:  sobrantePuntos > 0 ? sobranteSoles : 0,
            LeftoverPoints: sobrantePuntos);
    }

    /// <summary>Mensaje cuando el cupón ya está aplicado (reservado) en otro viaje.</summary>
    public const string AlreadyAppliedElsewhere = "Este cupón ya está aplicado a otro viaje.";

    private static CouponValidationDto No(string motivo) =>
        new(false, null, null, null, 0, 0, motivo, null);
}
