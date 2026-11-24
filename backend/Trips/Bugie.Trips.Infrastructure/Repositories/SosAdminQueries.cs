using System.Data;
using Dapper;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

/// <summary>Consultas y marcas de atencion del Centro SOS del admin (ver ISosAdminQueries).</summary>
public class SosAdminQueries : ISosAdminQueries
{
    private readonly IDbConnection _db;
    public SosAdminQueries(IDbConnection db) => _db = db;

    /// <summary>
    /// Instante de respuesta de la alerta con alias <paramref name="a"/>: lo primero
    /// entre visto y atendiendo (LEAST ignora los NULL); si se resolvio sin ninguna
    /// marca, la hora de resolucion. NULL si sigue activa y nadie la vio.
    /// </summary>
    internal static string ResponseAtSql(string a) =>
        $"COALESCE(LEAST({a}.FirstSeenAt, {a}.AttendingAt), CASE WHEN {a}.Resolved IS TRUE THEN {a}.ResolvedAt END)";

    /// <summary>Resuelta sin visto ni atendiendo ("atencion no registrada").</summary>
    internal static string UnregisteredSql(string a) =>
        $"({a}.Resolved IS TRUE AND {a}.FirstSeenAt IS NULL AND {a}.AttendingAt IS NULL)";

    /// <summary>Minutos (double) entre la activacion y el instante dado (nunca negativo).</summary>
    private static string MinutesSql(string a, string at) =>
        $"CAST(GREATEST(0, EXTRACT(EPOCH FROM ({at} - {a}.CreatedAt))) / 60.0 AS double precision)";

    private static readonly string Select = $@"
        SELECT s.Id, s.TripId, s.UserId, s.UserRole, s.Lat, s.Lng, s.Resolved,
               s.CreatedAt, s.ResolvedAt, s.ResolutionReason, s.ResolvedBy,
               ur.FullName AS ResolvedByName,
               CASE WHEN s.ResolvedAt IS NULL THEN NULL
                    ELSE CAST(EXTRACT(EPOCH FROM (s.ResolvedAt - s.CreatedAt)) / 60.0 AS double precision) END AS DurationMinutes,
               s.FirstSeenAt, s.FirstSeenBy, s.FirstSeenByName,
               s.AttendingAt, s.AttendingBy, s.AttendingByName,
               {MinutesSql("s", ResponseAtSql("s"))} AS ResponseMinutes,
               {UnregisteredSql("s")} AS AttentionUnregistered,
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

    public Task<SosAdminRow?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<SosAdminRow?>(
            new CommandDefinition($"{Select} WHERE s.Id = @Id", new { Id = id }, cancellationToken: ct));

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

    // Alertas activas del mismo viaje que la alerta pedida (como al resolver).
    private const string SameTripActive = @"
        s.TripId = (SELECT a.TripId FROM trips.SosAlerts a WHERE a.Id = @Id)
        AND s.Resolved = FALSE";

    private const string AdminName = "(SELECT u.FullName FROM auth.Users u WHERE u.Id = @AdminId)";

    public Task<int> MarkSeenAsync(Guid alertId, Guid adminId, CancellationToken ct = default) =>
        _db.ExecuteAsync(new CommandDefinition($@"
            UPDATE trips.SosAlerts s SET
                FirstSeenAt     = now(),
                FirstSeenBy     = @AdminId,
                FirstSeenByName = {AdminName}
            WHERE {SameTripActive}
              AND s.FirstSeenAt IS NULL",
            new { Id = alertId, AdminId = adminId }, cancellationToken: ct));

    public Task<int> MarkAttendingAsync(Guid alertId, Guid adminId, CancellationToken ct = default) =>
        // En el SET, s.FirstSeenAt es el valor anterior a la actualizacion.
        _db.ExecuteAsync(new CommandDefinition($@"
            UPDATE trips.SosAlerts s SET
                AttendingAt     = now(),
                AttendingBy     = @AdminId,
                AttendingByName = {AdminName},
                FirstSeenAt     = COALESCE(s.FirstSeenAt, now()),
                FirstSeenBy     = CASE WHEN s.FirstSeenAt IS NULL THEN @AdminId ELSE s.FirstSeenBy END,
                FirstSeenByName = CASE WHEN s.FirstSeenAt IS NULL THEN {AdminName} ELSE s.FirstSeenByName END
            WHERE {SameTripActive}
              AND s.AttendingAt IS NULL",
            new { Id = alertId, AdminId = adminId }, cancellationToken: ct));

    public async Task<SosAuditData> GetAuditAsync(ReportPeriod period, double goalMin, int page, int pageSize,
                                                  CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var sql = $@"
            -- 1) Resumen de las alertas creadas en el periodo
            SELECT
                COUNT(*)::int                                   AS Total,
                COUNT(*) FILTER (WHERE x.Resolved IS TRUE)::int     AS Resolved,
                COUNT(*) FILTER (WHERE x.Resolved IS NOT TRUE)::int AS Open,
                COUNT(x.Resp)::int                                AS Responded,
                COUNT(*) FILTER (WHERE x.Resolved IS NOT TRUE AND x.Resp IS NULL)::int AS Pending,
                ROUND(AVG(x.Resp)::numeric, 1)                                           AS AvgResponseMin,
                ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY x.Resp))::numeric, 1) AS MedianResponseMin,
                ROUND(MAX(x.Resp)::numeric, 1)                                           AS MaxResponseMin,
                ROUND((100.0 * COUNT(*) FILTER (WHERE x.Resp < @Goal)
                      / NULLIF(COUNT(x.Resp), 0))::numeric, 1)                          AS RespondedUnder2MinPct,
                COUNT(*) FILTER (WHERE x.Unreg)::int                                     AS UnregisteredCount,
                ROUND(AVG(x.Res)::numeric, 1)                                            AS AvgResolveMin
            FROM (
                SELECT s.Resolved,
                       {MinutesSql("s", ResponseAtSql("s"))} AS Resp,
                       CASE WHEN s.Resolved IS TRUE AND s.ResolvedAt IS NOT NULL
                            THEN {MinutesSql("s", "s.ResolvedAt")} END AS Res,
                       {UnregisteredSql("s")} AS Unreg
                FROM trips.SosAlerts s
                WHERE s.CreatedAt >= @From AND s.CreatedAt < @To
            ) x;

            -- 2) Pagina de alertas, la mas reciente primero
            {Select}
            WHERE s.CreatedAt >= @From AND s.CreatedAt < @To
            ORDER BY s.CreatedAt DESC
            LIMIT @Take OFFSET @Skip;";

        var args = new
        {
            From = period.FromUtc,
            To   = period.ToUtc,
            Goal = goalMin,
            Take = pageSize,
            Skip = (page - 1) * pageSize,
        };

        using var grid = await _db.QueryMultipleAsync(new CommandDefinition(sql, args, cancellationToken: ct));
        var summary = await grid.ReadSingleAsync<SosAuditSummaryRow>();
        var items = (await grid.ReadAsync<SosAdminRow>()).ToList();
        foreach (var it in items) it.MeetsGoal = SosResponseGoal.Meets(it.ResponseMinutes, goalMin);
        return new SosAuditData { Summary = summary, Items = items, Total = summary.Total };
    }
}
