using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class RewardLevelRepository : IRewardLevelRepository
{
    private readonly IDbConnection _db;
    public RewardLevelRepository(IDbConnection db) => _db = db;

    public async Task<List<RewardLevel>> GetByUserTypeAsync(
        string userType, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<RewardLevel>(
            "SELECT * FROM rewards.Levels WHERE UserType = @UserType ORDER BY SortOrder",
            new { UserType = userType });
        return rows.ToList();
    }

    public async Task<List<RewardLevel>> GetAllAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<RewardLevel>(
            "SELECT * FROM rewards.Levels ORDER BY UserType, SortOrder");
        return rows.ToList();
    }

    public Task<RewardLevel?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<RewardLevel>(
            "SELECT * FROM rewards.Levels WHERE Id = @Id", new { Id = id });

    public Task UpdateAsync(RewardLevel level, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.Levels SET
                DisplayName          = @DisplayName,
                MinPoints            = @MinPoints,
                MaxPoints            = @MaxPoints,
                DiscountPercentage   = @DiscountPercentage,
                MonthlyFreeTrips     = @MonthlyFreeTrips,
                WeeklyRaffleTickets  = @WeeklyRaffleTickets,
                MonthlyRaffleTickets = @MonthlyRaffleTickets,
                IsActive             = @IsActive,
                UpdatedAt            = @UpdatedAt
            WHERE Id = @Id",
            level);
}
