using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface IRewardLevelRepository
{
    Task<List<RewardLevel>> GetByUserTypeAsync(string userType, CancellationToken ct = default);
    Task<List<RewardLevel>> GetAllAsync(CancellationToken ct = default);
    Task<RewardLevel?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task UpdateAsync(RewardLevel level, CancellationToken ct = default);
}
