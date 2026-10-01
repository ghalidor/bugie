using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class ReviewRepository : IReviewRepository
{
    private readonly IDbConnection _db;
    public ReviewRepository(IDbConnection db) => _db = db;

    public async Task<List<Review>> GetByDriverAsync(Guid driverId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Review>(
            "SELECT * FROM drivers.Reviews WHERE DriverId = @Id ORDER BY CreatedAt DESC",
            new { Id = driverId });
        return rows.ToList();
    }

    public Task AddAsync(Review review, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO drivers.Reviews
                (Id, DriverId, PassengerId, TripId, Rating, Comment, CreatedAt)
            VALUES
                (@Id, @DriverId, @PassengerId, @TripId, @Rating, @Comment, @CreatedAt)",
            review);

    public async Task<bool> ExistsForTripAsync(Guid tripId, CancellationToken ct = default)
    {
        var n = await _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(1) FROM drivers.Reviews WHERE TripId = @TripId", new { TripId = tripId });
        return n > 0;
    }
}
