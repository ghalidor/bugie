using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class LevelBenefitRepository : ILevelBenefitRepository
{
    private readonly IDbConnection _db;
    public LevelBenefitRepository(IDbConnection db) => _db = db;

    private sealed class CountRow
    {
        public string BenefitType { get; set; } = string.Empty;
        public int    Used        { get; set; }
    }

    private const string CountSql = @"
        SELECT c.BenefitType, COUNT(*)::int AS Used
        FROM rewards.LevelBenefitClaims c
        JOIN rewards.Redemptions r ON r.Id = c.RedemptionId
        WHERE c.UserId = @UserId AND c.Period = @Period
          AND r.Status <> 'cancelled'
        GROUP BY c.BenefitType";

    public async Task<Dictionary<string, int>> CountClaimsAsync(
        Guid userId, string period, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<CountRow>(CountSql, new { UserId = userId, Period = period });
        return rows.ToDictionary(r => r.BenefitType, r => r.Used);
    }

    public async Task<bool> ClaimAsync(
        Redemption redemption, string benefitType, string period,
        string levelName, int monthlyLimit, CancellationToken ct = default)
    {
        if (monthlyLimit <= 0) return false;

        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            // Bloquea los reclamos de ESTE usuario hasta que termine la
            // transaccion. Dos clics simultaneos se atienden uno tras otro y
            // el segundo ya ve el cupo usado por el primero.
            await _db.ExecuteAsync(
                "SELECT pg_advisory_xact_lock(hashtext('rewards.levelbenefit:' || @UserId::text))",
                new { redemption.UserId }, trx);

            var usados = (await _db.QueryAsync<CountRow>(CountSql,
                    new { redemption.UserId, Period = period }, trx))
                .Where(r => r.BenefitType == benefitType)
                .Sum(r => r.Used);

            if (usados >= monthlyLimit)
            {
                trx.Rollback();
                return false;
            }

            await _db.ExecuteAsync(@"
                INSERT INTO rewards.Redemptions
                    (Id, ProfileId, UserId, CatalogItemId, Code, ItemName,
                     PointsSpent, RewardType, AmountSoles, Quantity, Percentage,
                     Status, ExpiresAt, UsedAt, UsedReferenceId, UsedNote, CreatedAt)
                VALUES
                    (@Id, @ProfileId, @UserId, @CatalogItemId, @Code, @ItemName,
                     @PointsSpent, @RewardType, @AmountSoles, @Quantity, @Percentage,
                     @Status, @ExpiresAt, @UsedAt, @UsedReferenceId, @UsedNote, @CreatedAt)",
                redemption, trx);

            await _db.ExecuteAsync(@"
                INSERT INTO rewards.LevelBenefitClaims
                    (Id, ProfileId, UserId, BenefitType, Period, LevelName, RedemptionId, CreatedAt)
                VALUES
                    (@Id, @ProfileId, @UserId, @BenefitType, @Period, @LevelName, @RedemptionId, @CreatedAt)",
                new
                {
                    Id           = Guid.NewGuid(),
                    redemption.ProfileId,
                    redemption.UserId,
                    BenefitType  = benefitType,
                    Period       = period,
                    LevelName    = levelName,
                    RedemptionId = redemption.Id,
                    redemption.CreatedAt,
                }, trx);

            trx.Commit();
            return true;
        }
        catch
        {
            trx.Rollback();
            throw;
        }
        finally
        {
            if (wasClosed && _db.State == ConnectionState.Open) _db.Close();
        }
    }

    public async Task<List<LevelBenefitNoticeCandidate>> GetPassengersWithoutNoticeAsync(
        string period, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<LevelBenefitNoticeCandidate>(@"
            SELECT p.UserId, p.CurrentLevel
            FROM rewards.PointsProfiles p
            WHERE p.UserType = 'passenger'
              AND NOT EXISTS (
                  SELECT 1 FROM rewards.LevelBenefitNotices n
                  WHERE n.UserId = p.UserId AND n.Period = @Period)",
            new { Period = period });
        return rows.ToList();
    }

    public async Task<bool> TryMarkNoticeAsync(Guid userId, string period, CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            INSERT INTO rewards.LevelBenefitNotices (UserId, Period, CreatedAt)
            VALUES (@UserId, @Period, @Now)
            ON CONFLICT DO NOTHING",
            new { UserId = userId, Period = period, Now = DateTime.UtcNow }) == 1;
}
