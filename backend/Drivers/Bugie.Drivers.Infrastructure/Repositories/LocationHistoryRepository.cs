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

    /// <summary>
    /// Insercion masiva en una sola sentencia (unnest de arreglos). Las fechas van
    /// en UTC; el ::timestamp las deja como hora UTC sin zona, igual que AddAsync.
    /// </summary>
    public Task AddRangeAsync(IReadOnlyList<LocationHistory> points, CancellationToken ct = default)
    {
        if(points.Count == 0) return Task.CompletedTask;
        return _db.ExecuteAsync(@"
            INSERT INTO drivers.LocationHistory
                (DriverId, TripId, Lat, Lng, SpeedKmh, Heading, RecordedAt)
            SELECT u.DriverId, u.TripId, u.Lat, u.Lng, u.SpeedKmh, u.Heading, u.RecordedAt::timestamp
            FROM unnest(@DriverIds, @TripIds, @Lats, @Lngs, @Speeds, @Headings, @RecordedAts)
                 AS u(DriverId, TripId, Lat, Lng, SpeedKmh, Heading, RecordedAt)",
            new
            {
                DriverIds   = points.Select(p => p.DriverId).ToArray(),
                TripIds     = points.Select(p => p.TripId).ToArray(),
                Lats        = points.Select(p => p.Lat).ToArray(),
                Lngs        = points.Select(p => p.Lng).ToArray(),
                Speeds      = points.Select(p => p.SpeedKmh).ToArray(),
                Headings    = points.Select(p => p.Heading).ToArray(),
                RecordedAts = points.Select(p => DateTime.SpecifyKind(p.RecordedAt, DateTimeKind.Utc)).ToArray(),
            });
    }

    public async Task<List<LocationHistory>> GetByTripAsync(Guid tripId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<LocationHistory>(
            "SELECT * FROM drivers.LocationHistory WHERE TripId = @TripId ORDER BY RecordedAt ASC",
            new { TripId = tripId });
        return rows.ToList();
    }
}
