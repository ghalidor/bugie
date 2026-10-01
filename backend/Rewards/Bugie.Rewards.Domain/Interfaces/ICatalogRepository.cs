using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface ICatalogRepository
{
    /// <summary>Items visibles para el usuario. onlyActive=false lo usa el admin.</summary>
    Task<List<CatalogItem>> GetByUserTypeAsync(
        string userType, bool onlyActive, CancellationToken ct = default);

    Task<List<CatalogItem>> GetAllAsync(CancellationToken ct = default);
    Task<CatalogItem?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<CatalogItem?> GetByCodeAsync(string code, CancellationToken ct = default);
    Task AddAsync(CatalogItem item, CancellationToken ct = default);
    Task UpdateAsync(CatalogItem item, CancellationToken ct = default);
}
