using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class TripPathRepository : ITripPathRepository
{
    private readonly IDbConnection _db;
    public TripPathRepository(IDbConnection db) => _db = db;

    public async Task<TripPath?> GetAsync(Guid tripId, CancellationToken ct = default) =>
        await _db.QuerySingleOrDefaultAsync<TripPath>(new CommandDefinition(@"
            SELECT tripid, driverid, pointcount, distancekm, startedat, endedat,
                   points, details::text AS details, consolidatedat
              FROM drivers.trippaths
             WHERE tripid = @TripId",
            new { TripId = tripId }, cancellationToken: ct));

    public Task<int> ConsolidateAsync(Guid tripId, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT drivers.consolidate_trip_path(@TripId)",
            new { TripId = tripId }, cancellationToken: ct));

    public async Task<List<Guid>> GetPendingConsolidationAsync(DateTime lastPointBeforeUtc, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Guid>(new CommandDefinition(@"
            WITH g AS (
                SELECT tripid, count(*) AS n, max(recordedat) AS last_at
                  FROM drivers.locationhistory
                 WHERE tripid IS NOT NULL
                 GROUP BY tripid)
            SELECT g.tripid
              FROM g
              LEFT JOIN drivers.trippaths p ON p.tripid = g.tripid
             WHERE g.last_at < @Cutoff
               AND (p.tripid IS NULL OR p.pointcount <> g.n)
             ORDER BY g.last_at",
            new { Cutoff = lastPointBeforeUtc }, cancellationToken: ct));
        return rows.ToList();
    }
}
