namespace Bugie.Rewards.Application.DTOs;

/// <summary>
/// Promoción tal como la ve el admin.
///
/// Las condiciones salen desarmadas en campos sueltos, no como JSON: así la
/// pantalla trabaja con casillas y selectores, y nadie escribe llaves a mano.
/// El handler se encarga de armar y desarmar el JSON.
/// </summary>
/// <param name="Warning">
/// Advertencia cuando la promoción no va a hacer nada, por ejemplo si su
/// tipo todavía no lo aplica el motor o si ya venció.
/// </param>
public record PromotionDto(
    Guid      Id,
    string    Name,
    string?   Description,
    string    PromotionType,
    string    TargetUserType,
    decimal?  MultiplierValue,
    int?      BonusPoints,
    DateTime  StartDate,
    DateTime? EndDate,
    bool      IsActive,

    // ── Condiciones ──
    int[]?    DaysOfWeek,
    int?      StartHour,
    int?      EndHour,
    bool      FirstTripOfDay,
    string[]? PaymentMethods,
    decimal?  MinAmount,

    // ── Uso real ──
    int       TimesApplied,
    int       PointsGiven,

    string?   Warning);

/// <summary>Lo que manda la pantalla al crear o editar.</summary>
public record PromotionInput(
    string    Name,
    string?   Description,
    string    PromotionType,
    string    TargetUserType,
    decimal?  MultiplierValue,
    int?      BonusPoints,
    DateTime? StartDate,
    DateTime? EndDate,
    bool      IsActive,
    int[]?    DaysOfWeek,
    int?      StartHour,
    int?      EndHour,
    bool      FirstTripOfDay,
    string[]? PaymentMethods,
    decimal?  MinAmount);
