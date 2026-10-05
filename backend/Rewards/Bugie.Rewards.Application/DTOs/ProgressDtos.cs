namespace Bugie.Rewards.Application.DTOs;

/// <summary>Un día de la tira de racha.</summary>
public record ProgressDayDto(DateTime Date, bool HasTrip, bool IsToday);

/// <summary>Logros en curso: lo que al usuario le falta, no lo que ya ganó.</summary>
/// <param name="StreakDaysToGo">Días que faltan para cerrar el bloque en curso.</param>
/// <param name="WeeklyGoal">0 significa que la meta semanal está desactivada para este tipo de cuenta.</param>
public record ProgressDto(
    int    StreakDays,
    int    StreakTarget,
    int    StreakPoints,
    int    StreakDaysToGo,
    bool   TraveledToday,
    List<ProgressDayDto> Days,

    int    WeeklyTrips,
    int    WeeklyGoal,
    int    WeeklyPoints,

    bool      IsAnniversaryMonth,
    decimal   AnniversaryMultiplier,
    DateTime? MemberSince);
