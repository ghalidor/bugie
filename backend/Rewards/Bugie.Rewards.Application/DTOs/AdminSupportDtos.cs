namespace Bugie.Rewards.Application.DTOs;

public record UserSearchDto(
    Guid      UserId,
    string?   FullName,
    string?   Email,
    string?   Phone,
    string?   Role,
    /// <summary>false si nunca ganó puntos. Suele ser la respuesta al reclamo.</summary>
    bool      HasProfile,
    string?   UserType,
    string?   CurrentLevel,
    int       AvailablePoints,
    int       TotalPoints,
    DateTime? LastActivityDate);

public record ProfileSummaryDto(
    int       AvailablePoints,
    int       TotalPoints,
    int       RedeemedPoints,
    string    CurrentLevel,
    DateTime? PointsExpiryDate,
    DateTime  MemberSince);

public record UserRewardsDetailDto(
    UserSearchDto             User,
    ProfileSummaryDto?        Profile,
    List<PointsTransactionDto> History,
    List<RedemptionDto>       Redemptions,
    int                       Invited,
    int                       InvitedQualified,
    /// <summary>Logros recientes, en texto.</summary>
    List<string>              Milestones);

public record AdjustmentResultDto(
    int     PointsApplied,
    int     BalanceBefore,
    int     BalanceAfter,
    string  NewLevel,
    /// <summary>Aviso si no se pudo aplicar todo lo pedido.</summary>
    string? Warning);

// ── Balance del programa ──────────────────────────────────────────────

public record SourceBreakdownDto(string SourceEvent, string Label, int Transactions, int Points);

public record MonthlyPointsDto(string Month, int Issued, int Redeemed);

public record ProgramBalanceDto(
    int Profiles,
    int ProfilesWithPoints,
    /// <summary>Todo lo emitido desde el inicio.</summary>
    int PointsIssued,
    /// <summary>Lo que los usuarios pueden canjear hoy. Esto es la deuda.</summary>
    int PointsAvailable,
    int PointsRedeemed,
    int PointsExpired,
    int ActiveRedemptions,
    /// <summary>Qué porcentaje de lo emitido se canjeó.</summary>
    int RedemptionRate,
    List<SourceBreakdownDto> BySource,
    List<MonthlyPointsDto>   ByMonth);

// ── Cupones aplicados a viajes ────────────────────────────────────────

public record CouponUsageDto(
    Guid      TripId,
    string    CouponCode,
    string?   ItemName,
    decimal   FareBeforeDiscount,
    decimal   DiscountAmount,
    decimal   AmountPaid,
    string?   PassengerName,
    string?   DriverName,
    /// <summary>completed | cancelled | in_progress</summary>
    string    Status,
    DateTime  CreatedAt,
    DateTime? CompletedAt);

public record CouponUsageReportDto(
    int     Trips,
    int     TripsCompleted,
    int     TripsCancelled,
    decimal TotalDiscount,
    /// <summary>Descuento promedio por viaje.</summary>
    decimal AverageDiscount,
    /// <summary>true si el interruptor está apagado: entonces esto no crece.</summary>
    bool    FeatureEnabled,
    List<CouponUsageDto> Recent);
