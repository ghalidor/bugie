using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class UserDirectory : IUserDirectory
{
    private readonly IDbConnection _db;
    public UserDirectory(IDbConnection db) => _db = db;

    public async Task<Dictionary<Guid, UserNameRow>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken ct = default)
    {
        var list = ids.Distinct().ToArray();
        if (list.Length == 0) return new();
        var rows = await _db.QueryAsync<UserNameRow>(
            "SELECT Id, FullName, Role FROM auth.Users WHERE Id = ANY(@Ids)", new { Ids = list });
        return rows.ToDictionary(r => r.Id);
    }
}
