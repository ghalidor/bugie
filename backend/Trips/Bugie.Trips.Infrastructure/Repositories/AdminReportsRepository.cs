using System.Data;
using Dapper;
using Bugie.Trips.Domain.Common;
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

    public async Task<IReadOnlyList<MonthlyRankingRow>> GetMonthlyRankingAsync(
        DateTime from, DateTime to, CancellationToken ct = default)
    {
        // El mes se toma en hora de Peru (AT TIME ZONE 'America/Lima', ver BugieTime).
        // El puesto usa el mismo orden que el ranking mensual: promedio, cantidad, nombre.
        const string sql = @"
            WITH porMes AS (
                SELECT r.DriverId,
                       date_trunc('month', r.CreatedAt AT TIME ZONE 'America/Lima') AS Mes,
                       ROUND(AVG(CAST(r.Stars AS DECIMAL(5,3))), 2)       AS AvgStars,
                       COUNT(*)::int                                      AS RatingCount
                FROM trips.TripRatings r
                WHERE r.CreatedAt >= @From AND r.CreatedAt < @To
                GROUP BY r.DriverId, date_trunc('month', r.CreatedAt AT TIME ZONE 'America/Lima')
            )
            SELECT
                m.DriverId                                         AS DriverUserId,
                u.FullName                                         AS FullName,
                COALESCE(d.ProfilePhotoUrl, d.FaceIdPhotoUrl)      AS PhotoUrl,
                EXTRACT(YEAR  FROM m.Mes)::int                     AS Year,
                EXTRACT(MONTH FROM m.Mes)::int                     AS Month,
                m.AvgStars                                         AS AvgStars,
                m.RatingCount                                      AS RatingCount,
                ROW_NUMBER() OVER (PARTITION BY m.Mes
                    ORDER BY m.AvgStars DESC, m.RatingCount DESC, u.FullName ASC)::int AS Place
            FROM porMes m
            JOIN auth.Users u           ON u.Id     = m.DriverId
            LEFT JOIN drivers.Drivers d ON d.UserId = m.DriverId
            ORDER BY Year, Month, Place;
        ";

        var rows = await _db.QueryAsync<MonthlyRankingRow>(
            new CommandDefinition(sql, new { From = from, To = to }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<TripsSummaryData> GetTripsSummaryAsync(ReportPeriod period, double sosGoalMin, CancellationToken ct = default)
    {
        // Rango UTC [@From, @To). El dia/hora de Peru es (columna AT TIME ZONE 'America/Lima').
        // Status: 2 Accepted, 3 InProgress, 4 Completed, 5 Cancelled, 6 SOS.
        // Atribucion al dia: creado -> CreatedAt; completado -> CompletedAt;
        // cancelado -> COALESCE(CancelledAt, CreatedAt).
        const string sql = @"
            -- 1) Totales de viajes
            WITH t AS (
                SELECT tr.*,
                       (tr.CreatedAt >= @From AND tr.CreatedAt < @To) AS EsCreado,
                       (tr.Status = 4 AND tr.CompletedAt >= @From AND tr.CompletedAt < @To) AS EsCompletado,
                       (tr.Status = 5 AND COALESCE(tr.CancelledAt, tr.CreatedAt) >= @From
                                      AND COALESCE(tr.CancelledAt, tr.CreatedAt) <  @To) AS EsCancelado
                FROM trips.Trips tr
                WHERE (tr.CreatedAt   >= @From AND tr.CreatedAt   < @To)
                   OR (tr.CompletedAt >= @From AND tr.CompletedAt < @To)
                   OR (tr.CancelledAt >= @From AND tr.CancelledAt < @To)
            )
            SELECT
                COUNT(*) FILTER (WHERE EsCreado)::int     AS Created,
                COUNT(*) FILTER (WHERE EsCompletado)::int AS Completed,
                COUNT(*) FILTER (WHERE EsCancelado)::int  AS Cancelled,
                (SELECT COUNT(*)::int FROM trips.Trips x WHERE x.Status IN (2, 3, 6)) AS InProgressNow,
                COUNT(*) FILTER (WHERE EsCompletado AND ServiceType = 0)::int AS CompletedRides,
                COUNT(*) FILTER (WHERE EsCompletado AND ServiceType = 1)::int AS CompletedDeliveries,
                COUNT(*) FILTER (WHERE EsCancelado AND CancelledBy = 'passenger')::int AS CancelledByPassenger,
                COUNT(*) FILTER (WHERE EsCancelado AND CancelledBy = 'driver')::int    AS CancelledByDriver,
                COUNT(*) FILTER (WHERE EsCancelado AND CancelledBy = 'admin')::int     AS CancelledByAdmin,
                COUNT(*) FILTER (WHERE EsCancelado AND CancelledBy = 'system')::int    AS CancelledBySystem,
                ROUND(100.0 * COUNT(*) FILTER (WHERE EsCancelado)
                      / NULLIF(COUNT(*) FILTER (WHERE EsCompletado OR EsCancelado), 0), 1) AS CancellationRate,
                ROUND(COALESCE(SUM(FinalFare)      FILTER (WHERE EsCompletado), 0), 2) AS TotalFares,
                ROUND(AVG(FinalFare)               FILTER (WHERE EsCompletado), 2)      AS AvgFare,
                ROUND(COALESCE(SUM(DiscountAmount) FILTER (WHERE EsCompletado), 0), 2) AS TotalDiscounts,
                ROUND(AVG(DistanceKm) FILTER (WHERE EsCompletado)::numeric, 1)          AS AvgDistanceKm,
                ROUND((AVG(EXTRACT(EPOCH FROM (CompletedAt - StartedAt)))
                       FILTER (WHERE EsCompletado) / 60)::numeric, 1)                   AS AvgTripMin,
                ROUND((AVG(EXTRACT(EPOCH FROM (StartedAt - AcceptedAt)))
                       FILTER (WHERE EsCompletado) / 60)::numeric, 1)                   AS AvgPickupMin,
                COUNT(DISTINCT PassengerId) FILTER (WHERE EsCompletado)::int AS ActivePassengers,
                COUNT(DISTINCT DriverId)    FILTER (WHERE EsCompletado)::int AS ActiveDrivers
            FROM t;

            -- 2) SOS creados en el periodo; tiempos en minutos de los resueltos
            SELECT
                COUNT(*)::int                                 AS Total,
                COUNT(*) FILTER (WHERE s.Resolved IS TRUE)::int     AS Resolved,
                COUNT(*) FILTER (WHERE s.Resolved IS NOT TRUE)::int AS Open,
                ROUND(AVG(s.Minutos)::numeric, 1)                                         AS AvgResolveMin,
                ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY s.Minutos))::numeric, 1) AS MedianResolveMin,
                ROUND(MAX(s.Minutos)::numeric, 1)                                         AS MaxResolveMin,
                ROUND(100.0 * COUNT(*) FILTER (WHERE s.Minutos < @SosGoal)
                      / NULLIF(COUNT(s.Minutos), 0), 1)                                   AS ResolvedUnder2MinPct,
                ROUND(AVG(s.Respuesta)::numeric, 1)                                         AS AvgResponseMin,
                ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY s.Respuesta))::numeric, 1) AS MedianResponseMin,
                ROUND(100.0 * COUNT(*) FILTER (WHERE s.Respuesta < @SosGoal)
                      / NULLIF(COUNT(s.Respuesta), 0), 1)                                 AS RespondedUnder2MinPct,
                COUNT(*) FILTER (WHERE s.NoRegistrada)::int                                AS UnregisteredCount
            FROM (
                SELECT a.Resolved,
                       CASE WHEN a.Resolved IS TRUE AND a.ResolvedAt IS NOT NULL
                            THEN EXTRACT(EPOCH FROM (a.ResolvedAt - a.CreatedAt)) / 60 END AS Minutos,
                       -- Respuesta: lo primero entre visto y atendiendo; si se resolvio sin
                       -- ninguna marca, la resolucion (mismo criterio que SosAdminQueries.ResponseAtSql)
                       GREATEST(0, EXTRACT(EPOCH FROM (
                           COALESCE(LEAST(a.FirstSeenAt, a.AttendingAt),
                                    CASE WHEN a.Resolved IS TRUE THEN a.ResolvedAt END)
                           - a.CreatedAt))) / 60 AS Respuesta,
                       (a.Resolved IS TRUE AND a.FirstSeenAt IS NULL AND a.AttendingAt IS NULL) AS NoRegistrada
                FROM trips.SosAlerts a
                WHERE a.CreatedAt >= @From AND a.CreatedAt < @To
            ) s;

            -- 3) Desvios de ruta y alertas del monitor iniciados en el periodo
            SELECT
                (SELECT COUNT(*)::int FROM trips.RouteDeviations d
                 WHERE d.StartedAt >= @From AND d.StartedAt < @To)        AS Deviations,
                COUNT(*) FILTER (WHERE m.Type = 'no_signal')::int        AS AlertsNoSignal,
                COUNT(*) FILTER (WHERE m.Type = 'long_stop')::int        AS AlertsLongStop,
                COUNT(*) FILTER (WHERE m.Type = 'trip_delayed')::int     AS AlertsDelayed
            FROM trips.MonitorAlerts m
            WHERE m.StartedAt >= @From AND m.StartedAt < @To;

            -- 4) Serie diaria con todos los dias del rango (0 si no hubo nada)
            WITH dias AS (
                -- dias de calendario de Peru (timestamp sin zona: no depende de la sesion)
                SELECT g::date AS Dia FROM generate_series(@FromDay::timestamp, @ToDay::timestamp, interval '1 day') g
            ),
            creados AS (
                SELECT (CreatedAt AT TIME ZONE 'America/Lima')::date AS Dia, COUNT(*) AS N
                FROM trips.Trips
                WHERE CreatedAt >= @From AND CreatedAt < @To
                GROUP BY 1
            ),
            completados AS (
                SELECT (CompletedAt AT TIME ZONE 'America/Lima')::date AS Dia, COUNT(*) AS N, SUM(FinalFare) AS Monto
                FROM trips.Trips
                WHERE Status = 4 AND CompletedAt >= @From AND CompletedAt < @To
                GROUP BY 1
            ),
            cancelados AS (
                SELECT (COALESCE(CancelledAt, CreatedAt) AT TIME ZONE 'America/Lima')::date AS Dia, COUNT(*) AS N
                FROM trips.Trips
                WHERE Status = 5 AND COALESCE(CancelledAt, CreatedAt) >= @From
                                 AND COALESCE(CancelledAt, CreatedAt) <  @To
                GROUP BY 1
            )
            SELECT to_char(d.Dia, 'YYYY-MM-DD')           AS Date,
                   COALESCE(cr.N, 0)::int                 AS Created,
                   COALESCE(co.N, 0)::int                 AS Completed,
                   COALESCE(ca.N, 0)::int                 AS Cancelled,
                   ROUND(COALESCE(co.Monto, 0), 2)        AS Fares
            FROM dias d
            LEFT JOIN creados     cr ON cr.Dia = d.Dia
            LEFT JOIN completados co ON co.Dia = d.Dia
            LEFT JOIN cancelados  ca ON ca.Dia = d.Dia
            ORDER BY d.Dia;

            -- 5) Completados por hora de Peru (de StartedAt, o CreatedAt si no hay)
            SELECT h AS Hour, COUNT(t.Id)::int AS Completed
            FROM generate_series(0, 23) h
            LEFT JOIN trips.Trips t
                   ON t.Status = 4 AND t.CompletedAt >= @From AND t.CompletedAt < @To
                  AND EXTRACT(HOUR FROM COALESCE(t.StartedAt, t.CreatedAt) AT TIME ZONE 'America/Lima') = h
            GROUP BY h
            ORDER BY h;
        ";

        var args = new
        {
            From    = period.FromUtc,
            To      = period.ToUtc,
            FromDay = period.FromText,
            ToDay   = period.ToText,
            SosGoal = sosGoalMin,
        };

        using var grid = await _db.QueryMultipleAsync(new CommandDefinition(sql, args, cancellationToken: ct));
        var totals = await grid.ReadSingleAsync<TripsTotalsRow>();
        var sos    = await grid.ReadSingleAsync<SosSummaryRow>();
        sos.GoalMin = sosGoalMin;
        return new TripsSummaryData
        {
            Totals = totals,
            Sos    = sos,
            Safety = await grid.ReadSingleAsync<SafetySummaryRow>(),
            Daily  = (await grid.ReadAsync<TripsDailyRow>()).ToList(),
            Hourly = (await grid.ReadAsync<TripsHourlyRow>()).ToList(),
        };
    }
}
