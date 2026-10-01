using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class CatalogRepository : ICatalogRepository
{
    private readonly IDbConnection _db;
    public CatalogRepository(IDbConnection db) => _db = db;

    public async Task<List<CatalogItem>> GetByUserTypeAsync(
        string userType, bool onlyActive, CancellationToken ct = default)
    {
        var sql = onlyActive
            ? @"SELECT * FROM rewards.CatalogItems
                WHERE UserType = @UserType AND IsActive = true
                ORDER BY SortOrder, PointsCost"
            : @"SELECT * FROM rewards.CatalogItems
                WHERE UserType = @UserType
                ORDER BY SortOrder, PointsCost";

        var rows = await _db.QueryAsync<CatalogItem>(sql, new { UserType = userType });
        return rows.ToList();
    }

    public async Task<List<CatalogItem>> GetAllAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<CatalogItem>(
            "SELECT * FROM rewards.CatalogItems ORDER BY UserType, SortOrder, PointsCost");
        return rows.ToList();
    }

    public Task<CatalogItem?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<CatalogItem>(
            "SELECT * FROM rewards.CatalogItems WHERE Id = @Id", new { Id = id });

    public Task<CatalogItem?> GetByCodeAsync(string code, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<CatalogItem>(
            "SELECT * FROM rewards.CatalogItems WHERE Code = @Code", new { Code = code });

    public Task AddAsync(CatalogItem item, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO rewards.CatalogItems
                (Id, Code, UserType, Name, Description, PointsCost, RewardType,
                 AmountSoles, Quantity, Percentage, MinLevel, Stock,
                 ValidityDays, SortOrder, IsActive, CreatedAt, UpdatedAt)
            VALUES
                (@Id, @Code, @UserType, @Name, @Description, @PointsCost, @RewardType,
                 @AmountSoles, @Quantity, @Percentage, @MinLevel, @Stock,
                 @ValidityDays, @SortOrder, @IsActive, @CreatedAt, @UpdatedAt)",
            item);

    public Task UpdateAsync(CatalogItem item, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.CatalogItems SET
                UserType     = @UserType,
                Name         = @Name,
                Description  = @Description,
                PointsCost   = @PointsCost,
                RewardType   = @RewardType,
                AmountSoles  = @AmountSoles,
                Quantity     = @Quantity,
                Percentage   = @Percentage,
                MinLevel     = @MinLevel,
                Stock        = @Stock,
                ValidityDays = @ValidityDays,
                SortOrder    = @SortOrder,
                IsActive     = @IsActive,
                UpdatedAt    = @UpdatedAt
            WHERE Id = @Id",
            item);
}
