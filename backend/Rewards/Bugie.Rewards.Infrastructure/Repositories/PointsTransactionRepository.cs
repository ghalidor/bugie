using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class PointsTransactionRepository : IPointsTransactionRepository
{
    private readonly IDbConnection _db;
    public PointsTransactionRepository(IDbConnection db) => _db = db;

    /// <summary>
    /// ¿Ya ganó puntos por otro viaje dentro de ese rango?
    /// Se excluye el viaje actual porque el evento puede llegar repetido.
    /// </summary>
    public async Task<bool> HasEarnedOnDayAsync(
        Guid profileId, DateTime dayStartUtc, DateTime dayEndUtc,
        Guid excludeTripId, CancellationToken ct = default)
    {
        var count = await _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM rewards.PointsTransactions
            WHERE ProfileId   = @ProfileId
              AND Type        = 'earn'
              AND SourceEvent = 'trip_completed'
              AND ReferenceId IS DISTINCT FROM @ExcludeTripId
              AND CreatedAt  >= @Start
              AND CreatedAt   < @End",
            new
            {
                ProfileId     = profileId,
                ExcludeTripId = excludeTripId,
                Start         = dayStartUtc,
                End           = dayEndUtc,
            });
        return count > 0;
    }

    public async Task<(List<PointsTransaction> Items, int Total)> GetByProfileAsync(
        Guid profileId, int page, int pageSize, CancellationToken ct = default)
    {
        page     = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        const string sql = @"
            SELECT * FROM rewards.PointsTransactions
            WHERE ProfileId = @ProfileId
            ORDER BY CreatedAt DESC
            LIMIT @Take OFFSET @Skip;

            SELECT COUNT(*) FROM rewards.PointsTransactions WHERE ProfileId = @ProfileId;";

        using var multi = await _db.QueryMultipleAsync(sql,
            new { ProfileId = profileId, Take = pageSize, Skip = skip });

        var items = (await multi.ReadAsync<PointsTransaction>()).ToList();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }
}
