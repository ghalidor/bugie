using System.Data;
using Dapper;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class DriverDayStatsRepository : IDriverDayStatsRepository
{
    private readonly IDbConnection _db;
    public DriverDayStatsRepository(IDbConnection db) => _db = db;

    public async Task<List<DriverDayStats>> GetAsync(
        DateTime localDate, CancellationToken ct = default)
    {
        // El dia de Peru convertido a UTC (Kind = Utc) para consultar.
        var desde = BugieTime.PeruToUtc(localDate.Date);
        var hasta = desde.AddDays(1);

        // Un viaje cuenta por su momento de cierre: completado o cancelado.
        // Un viaje creado ayer y cancelado hoy es una cancelacion de HOY.
        var rows = await _db.QueryAsync<DriverDayStats>(@"
            SELECT DriverId,
                   -- ::int porque COUNT devuelve bigint y el record usa int.
                   COUNT(*) FILTER (WHERE Status = 4)::int                         AS Completed,
                   COUNT(*) FILTER (WHERE Status = 5 AND CancelledBy = 'driver')::int AS CancelledByDriver
            FROM trips.Trips
            WHERE DriverId IS NOT NULL
              AND COALESCE(CompletedAt, CancelledAt, CreatedAt) >= @Desde
              AND COALESCE(CompletedAt, CancelledAt, CreatedAt) <  @Hasta
              AND Status IN (4, 5)
            GROUP BY DriverId",
            new { Desde = desde, Hasta = hasta });

        return rows.ToList();
    }
}
