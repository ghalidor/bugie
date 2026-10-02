using System.Data;
using Dapper;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Infrastructure.Repositories;

public class UserNames : IUserNames
{
    private readonly IDbConnection _db;
    public UserNames(IDbConnection db) => _db = db;

    private sealed class Row { public Guid Id { get; set; } public string? FullName { get; set; } }

    public async Task<Dictionary<Guid, string>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
    {
        var list = ids.Distinct().ToArray();
        if (list.Length == 0) return new();
        var rows = await _db.QueryAsync<Row>(
            "SELECT Id, FullName FROM auth.Users WHERE Id = ANY(@Ids)", new { Ids = list });
        return rows.ToDictionary(r => r.Id, r => r.FullName ?? "");
    }
}
