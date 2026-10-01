using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class TripPhotoRepository : ITripPhotoRepository
{
    private readonly IDbConnection _db;
    public TripPhotoRepository(IDbConnection db) => _db = db;

    public Task AddAsync(TripPhoto p, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO trips.TripPhotos (Id, TripId, Url, Kind, UploadedBy, CreatedAt)
            VALUES (@Id, @TripId, @Url, @Kind, @UploadedBy, @CreatedAt)", p);

    public async Task<List<TripPhoto>> GetByTripAsync(Guid tripId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<TripPhoto>(
            "SELECT * FROM trips.TripPhotos WHERE TripId = @TripId ORDER BY CreatedAt",
            new { TripId = tripId });
        return rows.ToList();
    }
}
