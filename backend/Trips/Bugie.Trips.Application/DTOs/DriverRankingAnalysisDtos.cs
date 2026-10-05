namespace Bugie.Trips.Application.DTOs;

/// <summary>Análisis del ranking de conductores en varios meses.</summary>
public record DriverRankingAnalysisDto(
    int Months,
    int Top,
    IReadOnlyList<RankingMonthDto> Periods,
    IReadOnlyList<RankingDriverStatsDto> Drivers);

/// <summary>Un mes del rango: cuántos conductores tuvieron calificación y su top N.</summary>
public record RankingMonthDto(
    int Year,
    int Month,
    int RatedDrivers,
    IReadOnlyList<RankingTopItemDto> Top);

public record RankingTopItemDto(
    Guid DriverUserId,
    string FullName,
    int Place,
    decimal AvgStars,
    int RatingCount);

/// <summary>
/// Resumen de un conductor que estuvo al menos una vez en el top N.
/// Places trae su puesto en cada mes del rango (null = sin calificaciones ese mes).
/// Trend: up (mejora), down (empeora), flat (estable). TrendDelta &gt; 0 = subió puestos.
/// </summary>
public record RankingDriverStatsDto(
    Guid DriverUserId,
    string FullName,
    string? PhotoUrl,
    int MonthsRanked,
    int MonthsFirst,
    int MonthsTop3,
    int MonthsInTop,
    int BestPlace,
    int WorstPlace,
    decimal AvgPlace,
    decimal AvgStars,
    string Trend,
    decimal TrendDelta,
    IReadOnlyList<int?> Places);
