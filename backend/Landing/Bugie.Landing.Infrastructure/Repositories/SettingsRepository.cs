using System.Data;
using Dapper;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.Repositories;

public class SettingsRepository : ISettingsRepository
{
    private readonly IDbConnection _db;
    public SettingsRepository(IDbConnection db) => _db = db;

    public async Task<List<SystemSetting>> GetAllAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<SystemSetting>(
            "SELECT * FROM landing.SystemSettings ORDER BY SettingKey");
        return rows.ToList();
    }

    public Task<SystemSetting?> GetByKeyAsync(string key, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<SystemSetting>(
            "SELECT * FROM landing.SystemSettings WHERE SettingKey = @Key",
            new { Key = key });

    public Task UpdateAsync(SystemSetting setting, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE landing.SystemSettings
            SET Value = @Value, UpdatedAt = @UpdatedAt, UpdatedBy = @UpdatedBy
            WHERE Id = @Id",
            setting);
}
