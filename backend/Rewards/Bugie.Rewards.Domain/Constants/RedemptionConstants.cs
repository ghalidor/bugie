namespace Bugie.Rewards.Domain.Constants;

/// <summary>Que significa cada recompensa del catalogo.</summary>
public static class RewardTypes
{
    /// <summary>Descuento fijo en soles en el proximo viaje.</summary>
    public const string DiscountAmount = "discount_amount";

    /// <summary>Viaje gratis hasta un tope en soles.</summary>
    public const string FreeTrip = "free_trip";

    /// <summary>Porcentaje de descuento durante N dias.</summary>
    public const string DiscountPeriod = "discount_period";

    /// <summary>Tickets extra de sorteo.</summary>
    public const string RaffleTicket = "raffle_ticket";

    /// <summary>Bono en soles a la cuenta del conductor.</summary>
    public const string WalletBonus = "wallet_bonus";

    /// <summary>Producto fisico, se entrega fuera de la app.</summary>
    public const string Physical = "physical";

    /// <summary>Beneficio de un socio afiliado.</summary>
    public const string PartnerBenefit = "partner_benefit";

    public static readonly string[] All =
    {
        DiscountAmount, FreeTrip, DiscountPeriod, RaffleTicket,
        WalletBonus, Physical, PartnerBenefit
    };

    public static bool IsValid(string? v) => v is not null && All.Contains(v);

    /// <summary>
    /// Tipos que se aplican solos dentro de la app (descuento, viaje gratis).
    /// Los demas los tiene que marcar el admin cuando entrega el premio.
    /// </summary>
    public static bool IsAutomatic(string type) =>
        type is DiscountAmount or FreeTrip or DiscountPeriod;
}

public static class RedemptionStatus
{
    /// <summary>Cupon vigente, sin usar.</summary>
    public const string Active = "active";

    /// <summary>Ya se aplico o se entrego.</summary>
    public const string Used = "used";

    /// <summary>Se vencio sin usarse.</summary>
    public const string Expired = "expired";

    /// <summary>Anulado por el admin. Los puntos se devuelven.</summary>
    public const string Cancelled = "cancelled";
}

public static class RedemptionSourceEvents
{
    public const string CatalogRedemption = "catalog_redemption";
    public const string RedemptionRefund  = "redemption_refund";
}
