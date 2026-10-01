using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class IncidentRepository : IIncidentRepository
{
    private readonly IDbConnection _db;
    public IncidentRepository(IDbConnection db) => _db = db;

    public Task<Incident?> GetByTripAndRoleAsync(Guid tripId, string role, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Incident>(@"
            SELECT * FROM trips.Incidents
            WHERE TripId = @TripId AND ReportedByRole = @Role",
            new { TripId = tripId, Role = role });

    public async Task<List<Incident>> GetByTripAsync(Guid tripId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Incident>(
            "SELECT * FROM trips.Incidents WHERE TripId = @Id ORDER BY CreatedAt DESC",
            new { Id = tripId });
        return rows.ToList();
    }

    /// <summary>
    /// Cuenta cuántas incidencias hay por viaje. Usado por el admin para
    /// poner badge en la lista de viajes y destacar los que tienen reportes.
    /// </summary>
    public async Task<Dictionary<Guid, int>> CountByTripIdsAsync(
        IEnumerable<Guid> tripIds, CancellationToken ct = default)
    {
        var ids = tripIds?.Distinct().ToList() ?? new List<Guid>();
        if(ids.Count == 0) return new Dictionary<Guid, int>();

        var rows = await _db.QueryAsync<(Guid TripId, int Count)>(@"
            SELECT TripId, COUNT(*) AS Count
            FROM trips.Incidents
            WHERE TripId = ANY(@Ids)
            GROUP BY TripId",
            new { Ids = ids.ToArray() });

        return rows.ToDictionary(r => r.TripId, r => r.Count);
    }

    public Task AddAsync(Incident incident, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO trips.Incidents
                (Id, TripId, ReportedByUserId, ReportedByRole, Description, CreatedAt)
            VALUES
                (@Id, @TripId, @ReportedByUserId, @ReportedByRole, @Description, @CreatedAt)",
            incident);
}