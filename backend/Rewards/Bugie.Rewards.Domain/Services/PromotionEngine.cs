using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Services;

/// <summary>Datos del viaje que el motor necesita para decidir.</summary>
public record TripContext(
    decimal  Amount,
    string   PaymentMethod,
    /// <summary>Hora LOCAL del viaje, ya convertida desde UTC.</summary>
    DateTime LocalTime,
    bool     IsFirstTripOfDay);

/// <summary>Una promoción que aplicó, con lo que aportó.</summary>
public record AppliedPromotion(Promotion Promotion, decimal ExtraMultiplier, int BonusPoints);

/// <summary>Resultado del cálculo.</summary>
public record PromotionResult(
    decimal TotalMultiplier,
    int     BonusPoints,
    IReadOnlyList<AppliedPromotion> Applied)
{
    public static PromotionResult None => new(1m, 0, Array.Empty<AppliedPromotion>());
}

/// <summary>
/// Decide qué promociones aplican a un viaje y cuánto aportan.
///
/// Las reglas de combinación, que son lo que hay que entender:
///
///   1. Las promociones de DÍA y de FRANJA HORARIA compiten entre sí. Solo
///      paga una. Gana la más específica: si el viaje cae dentro de una
///      franja, manda la franja aunque también sea un día con promoción.
///      Entre dos igual de específicas, gana la de multiplicador más alto.
///
///   2. Las de PRIMER VIAJE DEL DÍA y MÉTODO DE PAGO se suman encima. Su
///      aporte es lo que exceden de 1: una promoción de 2x suma +1.
///
///   3. Los puntos extra de todas las que apliquen se suman aparte, sin
///      multiplicarse.
///
/// Ejemplo. Lunes 5pm, viaje de S/ 10, tasa 10 puntos por sol:
///   · promo lunes 2x, promo franja 4-7pm 4x, primer viaje 2x, Yape +50
///   · base 100 puntos
///   · gana la franja (4x); el lunes NO suma
///   · primer viaje aporta +1 → multiplicador total 5
///   · 100 × 5 = 500, más 50 de Yape = 550 puntos
///
/// Es lógica pura: sin base de datos ni red, para poder verificarla sola.
/// </summary>
public static class PromotionEngine
{
    public static PromotionResult Evaluate(
        IEnumerable<Promotion> promotions,
        string   userType,
        DateTime utcNow,
        TripContext trip)
    {
        var candidates = promotions
            .Where(p => p.IsLiveAt(utcNow))
            .Where(p => p.AppliesTo(userType))
            // Solo se aplican las que dan puntos. 'discount' y 'free_trip'
            // actúan sobre la tarifa del viaje, que vive en el módulo Trips.
            .Where(p => p.PromotionType is "multiplier" or "bonus_points")
            .Where(p => Matches(p.Conditions, trip))
            .ToList();

        if (candidates.Count == 0) return PromotionResult.None;

        var applied = new List<AppliedPromotion>();

        // ── 1. La exclusiva: día o franja horaria ────────────────────────
        var exclusive = candidates
            .Where(p => p.Conditions.IsTimeBased && !p.Conditions.IsAdditive)
            .OrderByDescending(p => p.Conditions.TimeSpecificity)
            .ThenByDescending(p => p.MultiplierValue ?? 0)
            .FirstOrDefault();

        var baseMultiplier = 1m;
        if (exclusive is not null)
        {
            if (exclusive.PromotionType == "multiplier" && exclusive.MultiplierValue > 0)
            {
                baseMultiplier = exclusive.MultiplierValue.Value;
                applied.Add(new AppliedPromotion(exclusive, baseMultiplier - 1m, 0));
            }
            else if (exclusive.BonusPoints > 0)
            {
                applied.Add(new AppliedPromotion(exclusive, 0m, exclusive.BonusPoints.Value));
            }
        }

        // ── 2. Las que suman ─────────────────────────────────────────────
        var extraMultiplier = 0m;
        var bonusPoints     = 0;

        foreach (var p in candidates)
        {
            if (ReferenceEquals(p, exclusive)) continue;

            // Una promoción de tiempo que no ganó la exclusiva queda fuera:
            // es justamente lo que significa "solo paga la franja".
            if (p.Conditions.IsTimeBased && !p.Conditions.IsAdditive) continue;

            if (p.PromotionType == "multiplier" && p.MultiplierValue > 0)
            {
                var extra = p.MultiplierValue.Value - 1m;
                if (extra <= 0) continue;
                extraMultiplier += extra;
                applied.Add(new AppliedPromotion(p, extra, 0));
            }
            else if (p.PromotionType == "bonus_points" && p.BonusPoints > 0)
            {
                bonusPoints += p.BonusPoints.Value;
                applied.Add(new AppliedPromotion(p, 0m, p.BonusPoints.Value));
            }
        }

        // Los puntos extra de la exclusiva también cuentan.
        bonusPoints += applied
            .Where(a => ReferenceEquals(a.Promotion, exclusive))
            .Sum(a => a.BonusPoints);

        return new PromotionResult(baseMultiplier + extraMultiplier, bonusPoints, applied);
    }

    /// <summary>¿El viaje cumple todas las condiciones de la promoción?</summary>
    private static bool Matches(PromotionConditions c, TripContext trip)
    {
        if (c.MinAmount is > 0 && trip.Amount < c.MinAmount.Value) return false;

        if (c.DaysOfWeek is { Length: > 0 })
        {
            // DayOfWeek de .NET: domingo = 0. Acá domingo = 7, como se habla.
            var day = (int)trip.LocalTime.DayOfWeek;
            if (day == 0) day = 7;
            if (!c.DaysOfWeek.Contains(day)) return false;
        }

        if (c.HasHours)
        {
            var hour  = trip.LocalTime.Hour;
            var start = c.StartHour!.Value;
            var end   = c.EndHour!.Value;

            // Franja que cruza la medianoche, por ejemplo de 22 a 2.
            var inside = start <= end
                ? hour >= start && hour < end
                : hour >= start || hour < end;

            if (!inside) return false;
        }

        if (c.FirstTripOfDay == true && !trip.IsFirstTripOfDay) return false;

        if (c.PaymentMethods is { Length: > 0 })
        {
            var method = (trip.PaymentMethod ?? string.Empty).Trim().ToLowerInvariant();
            if (!c.PaymentMethods.Any(m => m.Trim().ToLowerInvariant() == method)) return false;
        }

        return true;
    }

    /// <summary>
    /// Puntos finales. Se trunca hacia abajo una sola vez, al final, para no
    /// perder céntimos de punto en cada paso.
    /// </summary>
    public static int ApplyTo(decimal amount, decimal rate, PromotionResult promo)
    {
        if (amount <= 0 || rate <= 0) return promo.BonusPoints;
        var basePoints = amount * rate * promo.TotalMultiplier;
        return (int)Math.Floor(basePoints) + promo.BonusPoints;
    }
}
