namespace Bugie.Rewards.Application.DTOs;

/// <param name="HasProfile">false si nunca ganó puntos. Suele ser la respuesta al reclamo.</param>
public record UserSearchDto(
    Guid      UserId,
    string?   FullName,
    string?   Email,
    string?   Phone,
    string?   Role,
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

/// <param name="Milestones">Logros recientes, en texto.</param>
public record UserRewardsDetailDto(
    UserSearchDto             User,
    ProfileSummaryDto?        Profile,
    List<PointsTransactionDto> History,
    List<RedemptionDto>       Redemptions,
    int                       Invited,
    int                       InvitedQualified,
    List<string>              Milestones);

/// <param name="Warning">Aviso si no se pudo aplicar todo lo pedido.</param>
public record AdjustmentResultDto(
    int     PointsApplied,
    int     BalanceBefore,
    int     BalanceAfter,
    string  NewLevel,
    string? Warning);

// ── Balance del programa ──────────────────────────────────────────────

public record SourceBreakdownDto(string SourceEvent, string Label, int Transactions, int Points);

public record MonthlyPointsDto(string Month, int Issued, int Redeemed);

/// <param name="PointsIssued">Todo lo emitido desde el inicio.</param>
/// <param name="PointsAvailable">Lo que los usuarios pueden canjear hoy. Esto es la deuda.</param>
/// <param name="RedemptionRate">Qué porcentaje de lo emitido se canjeó.</param>
public record ProgramBalanceDto(
    int Profiles,
    int ProfilesWithPoints,
    int PointsIssued,
    int PointsAvailable,
    int PointsRedeemed,
    int PointsExpired,
    int ActiveRedemptions,
    int RedemptionRate,
    List<SourceBreakdownDto> BySource,
    List<MonthlyPointsDto>   ByMonth);

// ── Cupones aplicados a viajes ────────────────────────────────────────

/// <param name="Status">completed | cancelled | in_progress</param>
public record CouponUsageDto(
    Guid      TripId,
    string    CouponCode,
    string?   ItemName,
    decimal   FareBeforeDiscount,
    decimal   DiscountAmount,
    decimal   AmountPaid,
    string?   PassengerName,
    string?   DriverName,
    string    Status,
    DateTime  CreatedAt,
    DateTime? CompletedAt);

/// <param name="AverageDiscount">Descuento promedio por viaje.</param>
/// <param name="FeatureEnabled">true si el interruptor está apagado: entonces esto no crece.</param>
public record CouponUsageReportDto(
    int     Trips,
    int     TripsCompleted,
    int     TripsCancelled,
    decimal TotalDiscount,
    decimal AverageDiscount,
    bool    FeatureEnabled,
    List<CouponUsageDto> Recent);
