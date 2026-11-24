namespace Bugie.Rewards.Domain.Services;

/// <summary>
/// Regla del dueño: si un cupón de monto vale más que el viaje, el viaje sale
/// gratis y lo que sobra vuelve al pasajero como puntos.
///
/// Solo los cupones de monto fijo (S/ X de descuento, viaje gratis hasta S/ X)
/// pueden sobrar. Un porcentaje nunca supera la tarifa, así que no genera
/// sobrante.
///
/// La usan los dos momentos: al aplicar el cupón (para avisarle al pasajero
/// antes) y al completar el viaje (para acreditar de verdad).
/// </summary>
public static class CouponLeftoverRules
{
    /// <summary>Tipos de cupón cuyo valor es un monto en soles.</summary>
    public static bool IsAmountType(string? rewardType) =>
        rewardType is "discount_amount" or "free_trip";

    /// <summary>
    /// Soles que sobran del cupón: su valor menos lo que de verdad se
    /// descontó del viaje. 0 si no es de monto o no sobra nada.
    /// </summary>
    public static decimal LeftoverSoles(
        string? rewardType, decimal? couponAmount, decimal appliedDiscount)
    {
        if (!IsAmountType(rewardType)) return 0m;
        var sobra = (couponAmount ?? 0m) - Math.Max(0m, appliedDiscount);
        return sobra > 0 ? Math.Round(sobra, 2) : 0m;
    }

    /// <summary>
    /// Soles a puntos con la tasa del pasajero, redondeando hacia abajo a
    /// puntos enteros. Tasa 0 o negativa: no hay puntos.
    /// </summary>
    public static int ToPoints(decimal soles, decimal rate)
    {
        if (soles <= 0 || rate <= 0) return 0;
        return (int)Math.Floor(soles * rate);
    }
}
