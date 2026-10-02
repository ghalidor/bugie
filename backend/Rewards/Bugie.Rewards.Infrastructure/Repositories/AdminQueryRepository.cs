using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class AdminQueryRepository : IAdminQueryRepository
{
    private readonly IDbConnection _db;
    public AdminQueryRepository(IDbConnection db) => _db = db;

    /// <summary>
    /// Busca en auth.users, no en los perfiles de puntos.
    ///
    /// Es a propósito: si alguien reclama que no le llegaron sus puntos, lo
    /// más probable es que NO tenga perfil todavía. Buscando solo en perfiles,
    /// ese usuario sería invisible justo cuando más falta hace encontrarlo.
    /// </summary>
    public async Task<List<UserSearchRow>> SearchUsersAsync(
        string query, int take, CancellationToken ct = default)
    {
        var patron = $"%{query.Trim()}%";

        var rows = await _db.QueryAsync<UserSearchRow>(@"
            SELECT u.Id                                  AS UserId,
                   u.FullName,
                   u.Email,
                   u.Phone,
                   u.Role,
                   (p.Id IS NOT NULL)                    AS HasProfile,
                   p.UserType,
                   p.CurrentLevel,
                   COALESCE(p.AvailablePoints, 0)        AS AvailablePoints,
                   COALESCE(p.TotalPoints, 0)            AS TotalPoints,
                   p.LastActivityDate
            FROM auth.Users u
            LEFT JOIN rewards.PointsProfiles p ON p.UserId = u.Id
            WHERE u.Email    ILIKE @Patron
               OR u.FullName ILIKE @Patron
               OR u.Phone    ILIKE @Patron
            ORDER BY COALESCE(p.AvailablePoints, 0) DESC, u.FullName
            LIMIT @Take",
            new { Patron = patron, Take = take });

        return rows.ToList();
    }

    public Task<UserSearchRow?> GetUserAsync(Guid userId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<UserSearchRow>(@"
            SELECT u.Id AS UserId, u.FullName, u.Email, u.Phone, u.Role,
                   (p.Id IS NOT NULL) AS HasProfile,
                   p.UserType, p.CurrentLevel,
                   COALESCE(p.AvailablePoints, 0) AS AvailablePoints,
                   COALESCE(p.TotalPoints, 0)     AS TotalPoints,
                   p.LastActivityDate
            FROM auth.Users u
            LEFT JOIN rewards.PointsProfiles p ON p.UserId = u.Id
            WHERE u.Id = @Id",
            new { Id = userId });

    /// <summary>
    /// Todos los totales en una consulta. PointsAvailable es la deuda: puntos
    /// que los usuarios pueden canjear y que alguien va a tener que pagar.
    /// </summary>
    public Task<ProgramTotals> GetTotalsAsync(CancellationToken ct = default) =>
        _db.QuerySingleAsync<ProgramTotals>(@"
            -- Los ::int no son decoracion: en Postgres COUNT y SUM devuelven
            -- bigint, y estos valores se materializan en un record cuyos campos
            -- son int. Sin el casteo, Dapper no encuentra constructor que calce
            -- y falla al construir el objeto.
            SELECT
              (SELECT COUNT(*) FROM rewards.PointsProfiles)::int                AS Profiles,
              (SELECT COUNT(*) FROM rewards.PointsProfiles
                 WHERE AvailablePoints > 0)::int                                AS ProfilesWithPoints,
              (SELECT COALESCE(SUM(TotalPoints), 0)
                 FROM rewards.PointsProfiles)::int                              AS PointsIssued,
              (SELECT COALESCE(SUM(AvailablePoints), 0)
                 FROM rewards.PointsProfiles)::int                              AS PointsAvailable,
              (SELECT COALESCE(SUM(RedeemedPoints), 0)
                 FROM rewards.PointsProfiles)::int                              AS PointsRedeemed,
              (SELECT COALESCE(SUM(Points), 0) FROM rewards.PointsTransactions
                 WHERE Type = 'expire')::int                                    AS PointsExpired,
              (SELECT COUNT(*) FROM rewards.Redemptions
                 WHERE Status = 'active')::int                                  AS ActiveRedemptions");

    public async Task<List<SourceBreakdown>> GetBreakdownAsync(
        DateTime? fromUtc, CancellationToken ct = default)
    {
        var filtro = fromUtc is null ? "" : " AND CreatedAt >= @From";

        var rows = await _db.QueryAsync<SourceBreakdown>($@"
            SELECT SourceEvent,
                   COUNT(*)::int                 AS Transactions,
                   COALESCE(SUM(Points), 0)::int AS Points
            FROM rewards.PointsTransactions
            WHERE Type IN ('earn','bonus','adjust_add'){filtro}
            GROUP BY SourceEvent
            ORDER BY SUM(Points) DESC",
            new { From = fromUtc });

        return rows.ToList();
    }

    public async Task<List<MonthlyPoints>> GetMonthlyAsync(
        int months, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<MonthlyPoints>(@"
            SELECT to_char(date_trunc('month', CreatedAt), 'YYYY-MM') AS Month,
                   COALESCE(SUM(Points) FILTER
                     (WHERE Type IN ('earn','bonus','adjust_add')), 0)::int  AS Issued,
                   COALESCE(SUM(Points) FILTER (WHERE Type = 'redeem'), 0)::int AS Redeemed
            FROM rewards.PointsTransactions
            WHERE CreatedAt >= date_trunc('month', now()) - (@Months * INTERVAL '1 month')
            GROUP BY date_trunc('month', CreatedAt)
            ORDER BY date_trunc('month', CreatedAt)",
            new { Months = months });

        return rows.ToList();
    }

    /* ── Cupones aplicados a viajes ───────────────────────────────────── */

    /// <summary>
    /// El nombre del premio sale de rewards.Redemptions por el codigo. Si el
    /// cupon se borro, igual se muestra el viaje: lo que importa es cuanto se
    /// descontó, no como se llamaba el premio.
    /// </summary>
    public async Task<List<CouponUsageRow>> GetCouponUsageAsync(
        int take, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<CouponUsageRow>(@"
            SELECT t.Id                                   AS TripId,
                   t.CouponCode,
                   r.ItemName,
                   COALESCE(t.FareBeforeDiscount, 0)      AS FareBeforeDiscount,
                   COALESCE(t.DiscountAmount, 0)          AS DiscountAmount,
                   COALESCE(t.FinalFare, t.EstimatedFare) AS AmountPaid,
                   COALESCE(t.PlatformOwesDriver, 0)      AS PlatformOwesDriver,
                   up.FullName                            AS PassengerName,
                   ud.FullName                            AS DriverName,
                   t.Status,
                   t.CreatedAt,
                   t.CompletedAt
            FROM trips.Trips t
            LEFT JOIN rewards.Redemptions r ON upper(r.Code) = upper(t.CouponCode)
            LEFT JOIN auth.Users up ON up.Id = t.PassengerId
            LEFT JOIN auth.Users ud ON ud.Id = t.DriverId
            WHERE t.CouponCode IS NOT NULL
            ORDER BY t.CreatedAt DESC
            LIMIT @Take",
            new { Take = take });
        return rows.ToList();
    }

    public Task<CouponUsageTotals> GetCouponTotalsAsync(CancellationToken ct = default) =>
        _db.QuerySingleAsync<CouponUsageTotals>(@"
            SELECT COUNT(*)::int                                   AS Trips,
                   COALESCE(SUM(DiscountAmount), 0)                AS TotalDiscount,
                   COALESCE(SUM(PlatformOwesDriver), 0)            AS TotalOwed,
                   COUNT(*) FILTER (WHERE Status = 4)::int         AS TripsCompleted,
                   COUNT(*) FILTER (WHERE Status = 5)::int         AS TripsCancelled
            FROM trips.Trips
            WHERE CouponCode IS NOT NULL");
}
