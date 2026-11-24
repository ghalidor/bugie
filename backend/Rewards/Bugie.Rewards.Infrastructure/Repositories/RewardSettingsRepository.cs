using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class RewardSettingsRepository : IRewardSettingsRepository
{
    private readonly IDbConnection _db;
    public RewardSettingsRepository(IDbConnection db) => _db = db;

    public async Task<List<RewardSetting>> GetAllAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<RewardSetting>(
            "SELECT * FROM rewards.Settings ORDER BY SettingKey");
        return rows.ToList();
    }

    private sealed class SettingRow
    {
        public string SettingKey { get; set; } = string.Empty;
        public string Value      { get; set; } = string.Empty;
    }

    public async Task<Dictionary<string, string>> GetMapAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<SettingRow>(
            "SELECT SettingKey, Value FROM rewards.Settings");
        return rows.ToDictionary(r => r.SettingKey, r => r.Value);
    }

    public Task UpsertAsync(string key, string value, Guid? updatedBy, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO rewards.Settings (Id, SettingKey, Value, UpdatedAt, UpdatedBy)
            VALUES (gen_random_uuid(), @Key, @Value, now(), @UpdatedBy)
            ON CONFLICT (SettingKey) DO UPDATE SET
                Value     = EXCLUDED.Value,
                UpdatedAt = now(),
                UpdatedBy = EXCLUDED.UpdatedBy",
            new { Key = key, Value = value, UpdatedBy = updatedBy });
}
