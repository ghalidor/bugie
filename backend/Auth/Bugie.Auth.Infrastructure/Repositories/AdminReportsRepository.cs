using System.Data;
using Dapper;
using Bugie.Auth.Domain.Common;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Repositories;

/// <summary>Reportes administrativos de usuarios. Todo se agrega en SQL.</summary>
public class AdminReportsRepository : IAdminReportsRepository
{
    private readonly IDbConnection _db;
    public AdminReportsRepository(IDbConnection db) => _db = db;

    public async Task<UsersReportData> GetUsersReportAsync(ReportPeriod period, CancellationToken ct = default)
    {
        // Rango UTC [@From, @To). El dia de Peru es (CreatedAt AT TIME ZONE 'America/Lima'). Se excluyen admins.
        const string sql = @"
            -- 1) Nuevos del periodo y totales actuales
            SELECT
                COUNT(*) FILTER (WHERE u.Role = 'passenger' AND u.CreatedAt >= @From AND u.CreatedAt < @To)::int AS NewPassengers,
                COUNT(*) FILTER (WHERE u.Role = 'driver'    AND u.CreatedAt >= @From AND u.CreatedAt < @To)::int AS NewDrivers,
                COUNT(*) FILTER (WHERE u.Role = 'passenger' AND u.DeletedAt IS NULL)::int AS Passengers,
                COUNT(*) FILTER (WHERE u.Role = 'driver'    AND u.DeletedAt IS NULL)::int AS Drivers,
                COUNT(*) FILTER (WHERE u.IsActive AND u.DeletedAt IS NULL)::int           AS ActiveUsers
            FROM auth.Users u
            WHERE u.Role IN ('passenger', 'driver');

            -- 2) Serie diaria con todos los dias del rango (0 si no hubo registros)
            WITH dias AS (
                -- dias de calendario de Peru (timestamp sin zona: no depende de la sesion)
                SELECT g::date AS Dia FROM generate_series(@FromDay::timestamp, @ToDay::timestamp, interval '1 day') g
            ),
            nuevos AS (
                SELECT (u.CreatedAt AT TIME ZONE 'America/Lima')::date AS Dia,
                       COUNT(*) FILTER (WHERE u.Role = 'passenger') AS Pasajeros,
                       COUNT(*) FILTER (WHERE u.Role = 'driver')    AS Conductores
                FROM auth.Users u
                WHERE u.Role IN ('passenger', 'driver')
                  AND u.CreatedAt >= @From AND u.CreatedAt < @To
                GROUP BY 1
            )
            SELECT to_char(d.Dia, 'YYYY-MM-DD')      AS Date,
                   COALESCE(n.Pasajeros, 0)::int     AS Passengers,
                   COALESCE(n.Conductores, 0)::int   AS Drivers
            FROM dias d
            LEFT JOIN nuevos n ON n.Dia = d.Dia
            ORDER BY d.Dia;
        ";

        var args = new
        {
            From    = period.FromUtc,
            To      = period.ToUtc,
            FromDay = period.FromText,
            ToDay   = period.ToText,
        };

        using var grid = await _db.QueryMultipleAsync(new CommandDefinition(sql, args, cancellationToken: ct));
        return new UsersReportData
        {
            Counts = await grid.ReadSingleAsync<UsersReportCountsRow>(),
            Daily  = (await grid.ReadAsync<UsersDailyRow>()).ToList(),
        };
    }
}
