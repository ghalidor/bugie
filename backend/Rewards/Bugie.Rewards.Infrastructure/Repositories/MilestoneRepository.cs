using System.Data;
using Dapper;
using Npgsql;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class MilestoneRepository : IMilestoneRepository
{
    private readonly IDbConnection _db;
    public MilestoneRepository(IDbConnection db) => _db = db;

    private const string UniqueViolation = "23505";

    public async Task<List<DateTime>> GetTripTimesAsync(
        Guid profileId, DateTime sinceUtc, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<DateTime>(@"
            SELECT CreatedAt FROM rewards.PointsTransactions
            WHERE ProfileId   = @ProfileId
              AND Type        = 'earn'
              AND SourceEvent = 'trip_completed'
              AND CreatedAt  >= @Since
            ORDER BY CreatedAt",
            new { ProfileId = profileId, Since = sinceUtc });
        return rows.ToList();
    }

    public Task<int> CountTripsAsync(
        Guid profileId, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM rewards.PointsTransactions
            WHERE ProfileId   = @ProfileId
              AND Type        = 'earn'
              AND SourceEvent = 'trip_completed'
              AND CreatedAt  >= @From
              AND CreatedAt   < @To",
            new { ProfileId = profileId, From = fromUtc, To = toUtc });

    /// <summary>
    /// No se consulta antes de insertar: entre la consulta y el INSERT podrían
    /// colarse dos viajes a la vez. El índice único es el único árbitro.
    /// </summary>
    public async Task<bool> TryAwardAsync(MilestoneAward a, CancellationToken ct = default)
    {
        try
        {
            await _db.ExecuteAsync(@"
                INSERT INTO rewards.MilestoneAwards
                    (ProfileId, Type, PeriodKey, Points, Detail, CreatedAt)
                VALUES
                    (@ProfileId, @Type, @PeriodKey, @Points, @Detail, (now() AT TIME ZONE 'utc'))",
                a);
            return true;
        }
        catch (PostgresException ex) when (ex.SqlState == UniqueViolation)
        {
            return false;
        }
    }

    public async Task<List<MilestoneAward>> GetRecentAsync(
        Guid profileId, int take, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<MilestoneAward>(@"
            SELECT * FROM rewards.MilestoneAwards
            WHERE ProfileId = @ProfileId
            ORDER BY CreatedAt DESC
            LIMIT @Take",
            new { ProfileId = profileId, Take = take });
        return rows.ToList();
    }
}
