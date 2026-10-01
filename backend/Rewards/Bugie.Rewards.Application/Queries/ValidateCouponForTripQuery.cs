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
    decimal Fare,
    decimal PlatformFee) : IRequest<CouponValidationDto>;

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

        // El recorte a la comisión: el conductor cobra en persona, así que un
        // descuento mayor a la comisión lo dejaría cobrando de menos.
        var aplicado = bruto;
        string? aviso = null;

        if (options.CouponMaxIsCommission && q.PlatformFee >= 0 && bruto > q.PlatformFee)
        {
            aplicado = q.PlatformFee;
            aviso = aplicado <= 0
                ? "Este viaje no admite descuento."
                : $"Se aplicará S/ {aplicado:0.00} de los S/ {bruto:0.00} del cupón.";

            if (aplicado <= 0)
                return No("Este viaje no admite descuento.");
        }

        // Lo que la plataforma le quedaría debiendo al conductor: solo ocurre
        // cuando NO se recorta a la comisión y el descuento la supera.
        var debeAlConductor = options.CouponMaxIsCommission
            ? 0m
            : Math.Max(0m, aplicado - q.PlatformFee);

        return new CouponValidationDto(
            Valid:          true,
            Code:           cupon.Code,
            ItemName:       cupon.ItemName,
            RewardType:     cupon.RewardType,
            DiscountAmount: aplicado,
            FullDiscount:   bruto,
            OwedToDriver:   debeAlConductor,
            Reason:         null,
            Warning:        aviso);
    }

    private static CouponValidationDto No(string motivo) =>
        new(false, null, null, null, 0, 0, 0, motivo, null);
}
