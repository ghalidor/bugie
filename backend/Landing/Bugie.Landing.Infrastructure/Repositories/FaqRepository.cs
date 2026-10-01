using System.Data;
using Dapper;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.Repositories;

public class FaqRepository : IFaqRepository
{
    private readonly IDbConnection _db;
    public FaqRepository(IDbConnection db) => _db = db;

    public async Task<List<FaqItem>> GetPublishedAsync(string lang, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<FaqItem>(@"
            SELECT * FROM landing.FaqItems
            WHERE Lang = @Lang AND IsPublished = TRUE
            ORDER BY Category, SortOrder, CreatedAt",
            new { Lang = lang });
        return rows.ToList();
    }

    public async Task<List<FaqItem>> GetAllAsync(string lang, CancellationToken ct = default)
    {
        // Admin: trae todas (publicadas Y ocultas) ordenadas como se muestran en la landing.
        var rows = await _db.QueryAsync<FaqItem>(@"
            SELECT * FROM landing.FaqItems
            WHERE Lang = @Lang
            ORDER BY Category, SortOrder, CreatedAt",
            new { Lang = lang });
        return rows.ToList();
    }

    public Task<FaqItem?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<FaqItem>(
            "SELECT * FROM landing.FaqItems WHERE Id = @Id", new { Id = id });

    public Task AddAsync(FaqItem item, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO landing.FaqItems
                (Id, Lang, Category, Question, Answer, IsPublished, SortOrder, CreatedAt, UpdatedAt)
            VALUES
                (@Id, @Lang, @Category, @Question, @Answer, @IsPublished, @SortOrder, @CreatedAt, @UpdatedAt)",
            item);

    public Task UpdateAsync(FaqItem item, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE landing.FaqItems SET
                Lang        = @Lang,
                Category    = @Category,
                Question    = @Question,
                Answer      = @Answer,
                IsPublished = @IsPublished,
                SortOrder   = @SortOrder,
                UpdatedAt   = @UpdatedAt
            WHERE Id = @Id",
            item);

    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("DELETE FROM landing.FaqItems WHERE Id = @Id", new { Id = id });

    public async Task ReorderAsync(IEnumerable<Guid> orderedIds, CancellationToken ct = default)
    {
        // Reasigna SortOrder de cada Id según su posición en la lista (0, 1, 2, ...).
        // Hacemos un UPDATE por fila; Dapper agrupa los parámetros y SQL Server
        // los ejecuta secuencialmente. Para listas grandes (cientos), podríamos
        // pasarnos a TVP, pero acá típicamente son 5-30 preguntas por categoría.
        var batch = orderedIds.Select((id, idx) => new { Id = id, SortOrder = idx }).ToList();
        if(batch.Count == 0) return;

        await _db.ExecuteAsync(
            "UPDATE landing.FaqItems SET SortOrder = @SortOrder, UpdatedAt = (now() at time zone 'utc') WHERE Id = @Id",
            batch);
    }

    public async Task<int> GetMaxSortOrderAsync(string lang, string category, CancellationToken ct = default)
    {
        // ISNULL: si la categoría está vacía, el MAX es NULL → devolvemos -1 para que
        // el siguiente sea 0 (el primero de la categoría).
        var max = await _db.ExecuteScalarAsync<int?>(@"
            SELECT MAX(SortOrder) FROM landing.FaqItems
            WHERE Lang = @Lang AND Category = @Category",
            new { Lang = lang, Category = category });
        return max ?? -1;
    }
}
