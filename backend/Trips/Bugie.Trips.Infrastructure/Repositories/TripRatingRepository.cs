using System.Data;
using Dapper;
using Npgsql;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

/// <summary>
/// Repositorio de calificaciones de viajes (tabla trips.TripRatings).
/// </summary>
public class TripRatingRepository : ITripRatingRepository
{
    private readonly IDbConnection _db;
    public TripRatingRepository(IDbConnection db) => _db = db;

    /// <summary>
    /// Inserta una calificación. La tabla tiene UNIQUE(TripId), así que
    /// intentar insertar dos veces para el mismo viaje devuelve null
    /// (se captura la violación de UQ y se interpreta como "ya existía").
    /// </summary>
    public async Task<TripRating?> AddAsync(TripRating r, CancellationToken ct = default)
    {
        try
        {
            await _db.ExecuteAsync(@"
                INSERT INTO trips.TripRatings
                    (Id, TripId, PassengerId, DriverId, Stars, Comment, CreatedAt)
                VALUES
                    (@Id, @TripId, @PassengerId, @DriverId, @Stars, @Comment, @CreatedAt)",
                new
                {
                    r.Id,
                    r.TripId,
                    r.PassengerId,
                    r.DriverId,
                    r.Stars,
                    r.Comment,
                    r.CreatedAt
                });
            return r;
        }
        catch(PostgresException ex) when(ex.SqlState == "23505")
        {
            // 23505 = unique_violation en PostgreSQL (viola PK o UNIQUE).
            // Significa que el viaje ya fue calificado. Devolvemos null para que
            // el handler lo traduzca a 409 Conflict.
            return null;
        }
    }

    public Task<TripRating?> GetByTripAsync(Guid tripId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<TripRating?>(
            "SELECT * FROM trips.TripRatings WHERE TripId = @TripId",
            new { TripId = tripId });

    public async Task<List<TripRating>> ListByDriverAsync(
        Guid driverUserId, int page, int pageSize, CancellationToken ct = default)
    {
        // Page 1-based: skip = (page-1) * pageSize.
        var skip = Math.Max(0, (page - 1) * pageSize);
        var rows = await _db.QueryAsync<TripRating>(@"
            SELECT * FROM trips.TripRatings
            WHERE DriverId = @DriverId
            ORDER BY CreatedAt DESC
            LIMIT @Take OFFSET @Skip",
            new { DriverId = driverUserId, Skip = skip, Take = pageSize });
        return rows.ToList();
    }

    public async Task<int> CountByDriverAsync(Guid driverUserId, CancellationToken ct = default) =>
        await _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM trips.TripRatings WHERE DriverId = @DriverId",
            new { DriverId = driverUserId });

    public async Task<Dictionary<Guid, TripRating>> GetByTripIdsAsync(
        IEnumerable<Guid> tripIds, CancellationToken ct = default)
    {
        var ids = tripIds?.Distinct().ToList() ?? new List<Guid>();
        if(ids.Count == 0) return new Dictionary<Guid, TripRating>();

        // Una sola query con WHERE IN. Dapper expande automáticamente.
        var rows = await _db.QueryAsync<TripRating>(
            "SELECT * FROM trips.TripRatings WHERE TripId = ANY(@Ids)",
            new { Ids = ids.ToArray() });

        return rows.ToDictionary(r => r.TripId);
    }
}
