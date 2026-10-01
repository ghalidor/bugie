using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface IRewardSettingsRepository
{
    Task<List<RewardSetting>> GetAllAsync(CancellationToken ct = default);
    Task<Dictionary<string, string>> GetMapAsync(CancellationToken ct = default);
    Task UpsertAsync(string key, string value, Guid? updatedBy, CancellationToken ct = default);
}
