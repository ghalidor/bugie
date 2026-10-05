namespace Bugie.Rewards.Application.DTOs;

/// <summary>Lo que ve el usuario en su dashboard de puntos.</summary>
public record PointsProfileDto(
    Guid      UserId,
    string    UserType,
    int       TotalPoints,
    int       AvailablePoints,
    int       RedeemedPoints,
    string    CurrentLevel,
    string    CurrentLevelName,
    decimal   DiscountPercentage,
    string?   NextLevel,
    string?   NextLevelName,
    int       PointsToNextLevel,
    int       ProgressPercentage,
    DateTime? PointsExpiryDate,
    DateTime? LastActivityDate);

public record PointsTransactionDto(
    Guid      Id,
    string    Type,
    int       Points,
    string    SourceEvent,
    Guid?     ReferenceId,
    int       BalanceAfter,
    DateTime? ExpiryDate,
    string?   Notes,
    DateTime  CreatedAt);

public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize);

public record RewardLevelDto(
    Guid    Id,
    string  UserType,
    string  Name,
    string  DisplayName,
    short   SortOrder,
    int     MinPoints,
    int?    MaxPoints,
    decimal DiscountPercentage,
    int     MonthlyFreeTrips,
    int     WeeklyRaffleTickets,
    int     MonthlyRaffleTickets,
    bool    IsActive,
    // Solo pasajero: cupones de DiscountPercentage reclamables al mes y tope
    // de cada viaje gratis (null = sin viajes gratis).
    int      MonthlyDiscountCoupons = 0,
    decimal? FreeTripMaxAmount      = null);

public record RewardSettingDto(
    string    SettingKey,
    string    Value,
    string?   Description,
    DateTime  UpdatedAt);

/// <summary>Resultado de acreditar los puntos de un viaje.</summary>
/// <param name="Promotions">Promociones que aplicaron, para verlo en el log.</param>
public record AccrueTripPointsResultDto(
    Guid  TripId,
    int   PassengerPoints,
    int   DriverPoints,
    bool  Skipped,
    string? Reason,
    IReadOnlyList<string>? Promotions = null);
