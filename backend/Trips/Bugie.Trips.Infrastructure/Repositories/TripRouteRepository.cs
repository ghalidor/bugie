using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class TripRouteRepository : ITripRouteRepository
{
    private readonly IDbConnection _db;
    public TripRouteRepository(IDbConnection db) => _db = db;

    public Task AddAsync(TripRoutePoint point, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO trips.TripRoutePoints (TripId, Lat, Lng, SpeedKmh, RecordedAt)
            VALUES (@TripId, @Lat, @Lng, @SpeedKmh, @RecordedAt)",
            point);

    public async Task<List<TripRoutePoint>> GetByTripAsync(Guid tripId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<TripRoutePoint>(
            "SELECT * FROM trips.TripRoutePoints WHERE TripId = @TripId ORDER BY RecordedAt ASC",
            new { TripId = tripId });
        return rows.ToList();
    }
}
