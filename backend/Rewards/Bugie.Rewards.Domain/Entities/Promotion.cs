using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bugie.Rewards.Domain.Entities;

/// <summary>
/// Promoción configurable. Los campos salen del diccionario del PDF.
/// </summary>
public class Promotion
{
    public Guid      Id              { get; set; }
    public string    Name            { get; set; } = string.Empty;
    public string?   Description     { get; set; }

    /// <summary>multiplier | bonus_points | discount | free_trip</summary>
    public string    PromotionType   { get; set; } = string.Empty;

    /// <summary>passenger | driver | both</summary>
    public string    TargetUserType  { get; set; } = "both";

    /// <summary>2.00 = el doble de puntos. Solo para 'multiplier'.</summary>
    public decimal?  MultiplierValue { get; set; }

    /// <summary>Puntos fijos que se suman. Solo para 'bonus_points'.</summary>
    public int?      BonusPoints     { get; set; }

    public DateTime  StartDate       { get; set; }
    public DateTime? EndDate         { get; set; }

    public string    ConditionsJson  { get; set; } = "{}";
    public bool      IsActive        { get; set; } = true;
    public DateTime  CreatedAt       { get; set; }
    public DateTime  UpdatedAt       { get; set; }

    private PromotionConditions? _conditions;

    /// <summary>
    /// Condiciones ya convertidas. Si el JSON está mal escrito se devuelven
    /// condiciones vacías: la promoción aplicaría siempre, nunca revienta.
    /// </summary>
    [JsonIgnore]
    public PromotionConditions Conditions =>
        _conditions ??= PromotionConditions.Parse(ConditionsJson);

    /// <summary>Vigente por fechas y por el interruptor.</summary>
    public bool IsLiveAt(DateTime utcNow) =>
        IsActive && StartDate <= utcNow && (EndDate is null || EndDate > utcNow);

    public bool AppliesTo(string userType) =>
        TargetUserType == "both" || TargetUserType == userType;
}

/// <summary>
/// Condiciones de una promoción. Todas son opcionales: las que no se definen
/// no se evalúan.
/// </summary>
public class PromotionConditions
{
    /// <summary>1 = lunes … 7 = domingo. Vacío = cualquier día.</summary>
    public int[]?    DaysOfWeek     { get; set; }

    /// <summary>Hora local de inicio, incluida.</summary>
    public int?      StartHour      { get; set; }

    /// <summary>Hora local de fin, excluida. 12 a 14 cubre de 12:00 a 13:59.</summary>
    public int?      EndHour        { get; set; }

    /// <summary>Solo el primer viaje del día de ese usuario.</summary>
    public bool?     FirstTripOfDay { get; set; }

    /// <summary>Métodos de pago aceptados. Vacío = cualquiera.</summary>
    public string[]? PaymentMethods { get; set; }

    /// <summary>Monto mínimo del viaje para que aplique.</summary>
    public decimal?  MinAmount      { get; set; }

    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static PromotionConditions Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new PromotionConditions();
        try
        {
            return JsonSerializer.Deserialize<PromotionConditions>(json, Options)
                   ?? new PromotionConditions();
        }
        catch
        {
            // JSON inválido: se trata como "sin condiciones" en vez de tumbar
            // la acreditación de puntos de un viaje real.
            return new PromotionConditions();
        }
    }

    /// <summary>true si la promoción se restringe por día o por franja horaria.</summary>
    public bool IsTimeBased => HasHours || (DaysOfWeek is { Length: > 0 });

    public bool HasHours => StartHour is not null && EndHour is not null;

    /// <summary>
    /// Qué tan específica es, para desempatar entre promociones de tiempo:
    /// una franja horaria gana siempre a una de día completo.
    /// </summary>
    public int TimeSpecificity => HasHours ? 2 : (DaysOfWeek is { Length: > 0 } ? 1 : 0);

    /// <summary>
    /// true si la promoción se suma en vez de competir: primer viaje del día
    /// y método de pago.
    /// </summary>
    public bool IsAdditive =>
        FirstTripOfDay == true || (PaymentMethods is { Length: > 0 });
}
