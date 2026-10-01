using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class PromotionRepository : IPromotionRepository
{
    private readonly IDbConnection _db;
    public PromotionRepository(IDbConnection db) => _db = db;

    /// <summary>
    /// Vigentes por fecha y activas. El filtro fino de días, horas y método de
    /// pago lo hace el motor, no el SQL: así las reglas viven en un solo lugar
    /// y se pueden verificar sin base de datos.
    /// </summary>
    public async Task<List<Promotion>> GetLiveAsync(string userType, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Promotion>(@"
            SELECT * FROM rewards.Promotions
            WHERE IsActive = true
              AND StartDate <= now()
              AND (EndDate IS NULL OR EndDate > now())
              AND (TargetUserType = 'both' OR TargetUserType = @UserType)
            ORDER BY CreatedAt",
            new { UserType = userType });
        return rows.ToList();
    }

    public async Task<List<Promotion>> GetAllAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Promotion>(
            "SELECT * FROM rewards.Promotions ORDER BY IsActive DESC, Name");
        return rows.ToList();
    }

    public Task<Promotion?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Promotion>(
            "SELECT * FROM rewards.Promotions WHERE Id = @Id", new { Id = id });

    public Task AddAsync(Promotion p, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO rewards.Promotions
                (Id, Name, Description, PromotionType, TargetUserType,
                 MultiplierValue, BonusPoints, StartDate, EndDate,
                 ConditionsJson, IsActive, CreatedAt, UpdatedAt)
            VALUES
                (@Id, @Name, @Description, @PromotionType, @TargetUserType,
                 @MultiplierValue, @BonusPoints, @StartDate, @EndDate,
                 @ConditionsJson, @IsActive, @CreatedAt, @UpdatedAt)",
            p);

    public Task UpdateAsync(Promotion p, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.Promotions SET
                Name            = @Name,
                Description     = @Description,
                PromotionType   = @PromotionType,
                TargetUserType  = @TargetUserType,
                MultiplierValue = @MultiplierValue,
                BonusPoints     = @BonusPoints,
                StartDate       = @StartDate,
                EndDate         = @EndDate,
                ConditionsJson  = @ConditionsJson,
                IsActive        = @IsActive,
                UpdatedAt       = @UpdatedAt
            WHERE Id = @Id",
            p);

    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("DELETE FROM rewards.Promotions WHERE Id = @Id", new { Id = id });

    /// <summary>
    /// ON CONFLICT DO NOTHING: si el evento del viaje se reintenta, no se
    /// cuenta la misma promoción dos veces en los reportes.
    /// </summary>
    public async Task LogApplicationsAsync(
        Guid profileId, Guid tripId,
        IEnumerable<(Guid PromotionId, int PointsAdded)> applications,
        CancellationToken ct = default)
    {
        var rows = applications
            .Select(a => new
            {
                PromotionId = a.PromotionId,
                ProfileId   = profileId,
                TripId      = tripId,
                PointsAdded = a.PointsAdded,
            })
            .ToList();

        if (rows.Count == 0) return;

        await _db.ExecuteAsync(@"
            INSERT INTO rewards.PromotionApplications
                (PromotionId, ProfileId, TripId, PointsAdded, CreatedAt)
            VALUES
                (@PromotionId, @ProfileId, @TripId, @PointsAdded, now())
            ON CONFLICT DO NOTHING",
            rows);
    }

    private sealed class UsageRow
    {
        public Guid PromotionId { get; set; }
        public int  Times       { get; set; }
        public int  TotalPoints { get; set; }
    }

    public async Task<List<(Guid PromotionId, int Times, int TotalPoints)>> GetUsageAsync(
        CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<UsageRow>(@"
            SELECT PromotionId,
                   COUNT(*)              AS Times,
                   COALESCE(SUM(PointsAdded), 0) AS TotalPoints
            FROM rewards.PromotionApplications
            GROUP BY PromotionId");
        return rows.Select(r => (r.PromotionId, r.Times, r.TotalPoints)).ToList();
    }
}
