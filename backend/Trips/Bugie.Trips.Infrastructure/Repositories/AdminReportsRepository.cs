using System.Data;
using Dapper;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

/// <summary>
/// Repositorio para reportes administrativos.
/// El SQL hace JOIN cross-schema (drivers, auth, payments) porque la BD
/// es única. La complejidad de los JOINs queda encapsulada acá; el resto
/// del sistema solo ve filas planas (DriverRankingRow).
/// </summary>
public class AdminReportsRepository : IAdminReportsRepository
{
    private readonly IDbConnection _db;
    public AdminReportsRepository(IDbConnection db) => _db = db;

    public Task<int> CountDriversRatedInRangeAsync(
        DateTime from, DateTime to, CancellationToken ct = default)
    {
        const string sql = @"
            SELECT COUNT(DISTINCT r.DriverId)
            FROM trips.TripRatings r
            WHERE r.CreatedAt >= @From AND r.CreatedAt < @To;
        ";
        return _db.ExecuteScalarAsync<int>(
            new CommandDefinition(sql, new { From = from, To = to }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<DriverRankingRow>> GetDriverRankingPagedAsync(
        DateTime from, DateTime to, int skip, int take, CancellationToken ct = default)
    {
        // JOINs cross-schema:
        // - trips.TripRatings: base, agrupada por DriverId (=UserId del conductor).
        // - auth.Users: FullName, Email, Phone.
        // - drivers.Drivers: PhotoUrl (preferimos ProfilePhotoUrl, sino FaceIdPhotoUrl).
        // - trips.Trips: viajes completados del conductor en el mes (subconsulta).
        // - payments.Payments: ganancias del conductor en el mes (subconsulta).
        //
        // Las subconsultas evitan duplicar filas del GROUP BY. SQL Server las
        // optimiza igual; usamos esta forma porque es más legible que CTEs.
        // Trip.Status = 4 = Completed (ver Domain/Enums/TripStatus.cs).
        const string sql = @"
            SELECT
                r.DriverId                                          AS DriverUserId,
                u.FullName                                          AS FullName,
                u.Email                                             AS Email,
                u.Phone                                             AS Phone,
                COALESCE(d.ProfilePhotoUrl, d.FaceIdPhotoUrl)       AS PhotoUrl,
                ROUND(AVG(CAST(r.Stars AS DECIMAL(5,3))), 2)        AS AvgStars,
                COUNT(*)::int                                       AS RatingCount,
                (
                    SELECT COUNT(*)::int FROM trips.Trips t
                    WHERE t.DriverId = r.DriverId
                      AND t.Status = 4
                      AND t.CompletedAt >= @From
                      AND t.CompletedAt <  @To
                )                                                   AS TripsCompletedInMonth,
                (
                    SELECT COALESCE(SUM(p.DriverAmount), 0) FROM payments.Payments p
                    WHERE p.DriverId = r.DriverId
                      AND p.Status   = 'completed'
                      AND p.CreatedAt >= @From
                      AND p.CreatedAt <  @To
                )                                                   AS EarningsInMonth
            FROM trips.TripRatings r
            JOIN auth.Users u           ON u.Id     = r.DriverId
            LEFT JOIN drivers.Drivers d ON d.UserId = r.DriverId
            WHERE r.CreatedAt >= @From AND r.CreatedAt < @To
            GROUP BY
                r.DriverId, u.FullName, u.Email, u.Phone,
                d.ProfilePhotoUrl, d.FaceIdPhotoUrl
            ORDER BY AvgStars DESC, RatingCount DESC, FullName ASC
            LIMIT @Take OFFSET @Skip;
        ";

        var rows = await _db.QueryAsync<DriverRankingRow>(
            new CommandDefinition(sql,
                new { From = from, To = to, Skip = skip, Take = take },
                cancellationToken: ct));
        return rows.ToList();
    }
}
