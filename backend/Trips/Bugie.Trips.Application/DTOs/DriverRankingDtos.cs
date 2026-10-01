namespace Bugie.Trips.Application.DTOs;

/// <summary>Una fila del ranking de conductores que ve el admin.</summary>
public record DriverRankingItemDto(
    Guid DriverUserId,
    string FullName,
    string? Email,
    string? Phone,
    string? PhotoUrl,
    decimal AvgStars,
    int RatingCount,
    int TripsCompletedInMonth,
    decimal EarningsInMonth);

/// <summary>Respuesta paginada del ranking.</summary>
public record DriverRankingPagedDto(
    int Year,
    int Month,
    int Page,
    int PageSize,
    int Total,
    int TotalPages,
    IReadOnlyList<DriverRankingItemDto> Items);
