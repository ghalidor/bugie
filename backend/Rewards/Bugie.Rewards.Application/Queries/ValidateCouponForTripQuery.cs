using MediatR;
using Bugie.Rewards.Application.Config;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Application.Queries;

/// <summary>
/// ¿Se puede usar este cupón en este viaje, y cuánto descuenta?
///
/// Lo pregunta Trips antes de tocar la tarifa. Responde siempre, con el motivo
/// cuando no se puede: así Trips le muestra al pasajero por qué, en vez de un
/// error genérico.
/// </summary>
public record ValidateCouponForTripQuery(
    string  Code,
    Guid    UserId,
    decimal Fare) : IRequest<CouponValidationDto>;

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

        if (cupon.Status == "used")
            return No("Ese cupón ya se usó.");

        if (cupon.Status == "cancelled")
            return No("Ese cupón fue anulado.");

        if (cupon.Status == "expired" || cupon.ExpiresAt <= DateTime.UtcNow)
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
            Warning:        null);
    }

    private static CouponValidationDto No(string motivo) =>
        new(false, null, null, null, 0, 0, motivo, null);
}
