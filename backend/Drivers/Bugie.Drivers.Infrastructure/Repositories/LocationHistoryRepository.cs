using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class LocationHistoryRepository : ILocationHistoryRepository
{
    private readonly IDbConnection _db;
    public LocationHistoryRepository(IDbConnection db) => _db = db;

    public Task AddAsync(LocationHistory point, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO drivers.LocationHistory
                (DriverId, TripId, Lat, Lng, SpeedKmh, Heading, RecordedAt)
            VALUES
                (@DriverId, @TripId, @Lat, @Lng, @SpeedKmh, @Heading, @RecordedAt)",
            point);

    public async Task<List<LocationHistory>> GetByTripAsync(Guid tripId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<LocationHistory>(
            "SELECT * FROM drivers.LocationHistory WHERE TripId = @TripId ORDER BY RecordedAt ASC",
            new { TripId = tripId });
        return rows.ToList();
    }
}
