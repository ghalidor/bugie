using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Domain.Interfaces;

public interface ISettingsRepository
{
    Task<List<SystemSetting>> GetAllAsync(CancellationToken ct = default);
    Task<SystemSetting?>      GetByKeyAsync(string key, CancellationToken ct = default);
    Task                      UpdateAsync(SystemSetting setting, CancellationToken ct = default);
}
