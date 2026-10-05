using System.Data;
using Dapper;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

/// <summary>Consultas del Centro SOS del admin (ver ISosAdminQueries).</summary>
public class SosAdminQueries : ISosAdminQueries
{
    private readonly IDbConnection _db;
    public SosAdminQueries(IDbConnection db) => _db = db;

    private const string Select = @"
        SELECT s.Id, s.TripId, s.UserId, s.UserRole, s.Lat, s.Lng, s.Resolved,
               s.CreatedAt, s.ResolvedAt, s.ResolutionReason, s.ResolvedBy,
               ur.FullName AS ResolvedByName,
               CASE WHEN s.ResolvedAt IS NULL THEN NULL
                    ELSE CAST(EXTRACT(EPOCH FROM (s.ResolvedAt - s.CreatedAt)) / 60.0 AS double precision) END AS DurationMinutes,
               ua.FullName AS UserName, ua.Phone AS UserPhone,
               t.PassengerId, up.FullName AS PassengerName, up.Phone AS PassengerPhone,
               t.DriverId, ud.FullName AS DriverName, ud.Phone AS DriverPhone,
               t.OriginAddress, t.DestAddress
        FROM trips.SosAlerts s
        JOIN trips.Trips t      ON t.Id  = s.TripId
        LEFT JOIN auth.Users ua ON ua.Id = s.UserId
        LEFT JOIN auth.Users up ON up.Id = t.PassengerId
        LEFT JOIN auth.Users ud ON ud.Id = t.DriverId
        LEFT JOIN auth.Users ur ON ur.Id = s.ResolvedBy";

    public async Task<List<SosAdminRow>> GetActiveAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<SosAdminRow>(
            $"{Select} WHERE s.Resolved = FALSE ORDER BY s.CreatedAt ASC");
        return rows.ToList();
    }

    public async Task<(List<SosAdminRow> Items, int Total)> GetHistoryAsync(
        int page, int pageSize, DateTime? fromUtc, DateTime? toUtc, string? search,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var where = new List<string> { "s.Resolved = TRUE" };
        var p = new DynamicParameters();
        if (fromUtc.HasValue) { where.Add("s.CreatedAt >= @FromUtc"); p.Add("FromUtc", fromUtc.Value); }
        if (toUtc.HasValue)   { where.Add("s.CreatedAt < @ToUtc");    p.Add("ToUtc", toUtc.Value); }
        if (!string.IsNullOrWhiteSpace(search))
        {
            where.Add(@"(up.FullName ILIKE @Q OR up.Phone ILIKE @Q OR ud.FullName ILIKE @Q
                         OR ud.Phone ILIKE @Q OR s.ResolutionReason ILIKE @Q)");
            p.Add("Q", $"%{search.Trim()}%");
        }
        var whereSql = "WHERE " + string.Join(" AND ", where);
        p.Add("Take", pageSize);
        p.Add("Skip", (page - 1) * pageSize);

        var items = (await _db.QueryAsync<SosAdminRow>(
            $"{Select} {whereSql} ORDER BY s.CreatedAt DESC LIMIT @Take OFFSET @Skip", p)).ToList();
        var total = await _db.ExecuteScalarAsync<int>($@"
            SELECT COUNT(*)
            FROM trips.SosAlerts s
            JOIN trips.Trips t      ON t.Id  = s.TripId
            LEFT JOIN auth.Users up ON up.Id = t.PassengerId
            LEFT JOIN auth.Users ud ON ud.Id = t.DriverId
            {whereSql}", p);
        return (items, total);
    }
}
