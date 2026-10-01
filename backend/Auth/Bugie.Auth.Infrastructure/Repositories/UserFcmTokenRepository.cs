using System.Data;
using Dapper;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Repositories;

public class UserFcmTokenRepository : IUserFcmTokenRepository
{
    private readonly IDbConnection _db;
    public UserFcmTokenRepository(IDbConnection db) => _db = db;

    public async Task<List<UserFcmToken>> GetByUserIdAsync(Guid userId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<UserFcmToken>(
            "SELECT * FROM auth.UserFcmTokens WHERE UserId = @UserId ORDER BY UpdatedAt DESC",
            new { UserId = userId });
        return rows.ToList();
    }

    public Task<UserFcmToken?> GetByTokenAsync(string token, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<UserFcmToken>(
            "SELECT * FROM auth.UserFcmTokens WHERE Token = @Token",
            new { Token = token });

    public async Task<List<UserFcmToken>> GetByUserIdsAsync(IEnumerable<Guid> userIds, CancellationToken ct = default)
    {
        var ids = userIds?.ToList() ?? new List<Guid>();
        if(ids.Count == 0) return new List<UserFcmToken>();
        var rows = await _db.QueryAsync<UserFcmToken>(
            "SELECT * FROM auth.UserFcmTokens WHERE UserId = ANY(@Ids)",
            new { Ids = ids.ToArray() });
        return rows.ToList();
    }

    public Task AddAsync(UserFcmToken token, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO auth.UserFcmTokens
                (Id, UserId, Token, Platform, CreatedAt, UpdatedAt)
            VALUES
                (@Id, @UserId, @Token, @Platform, @CreatedAt, @UpdatedAt);",
            token);

    public Task UpdateAsync(UserFcmToken token, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE auth.UserFcmTokens
               SET UserId = @UserId,
                   Platform = @Platform,
                   UpdatedAt = @UpdatedAt
             WHERE Id = @Id;",
            token);

    public Task DeleteByTokenAsync(string token, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "DELETE FROM auth.UserFcmTokens WHERE Token = @Token",
            new { Token = token });

    public Task DeleteByUserIdAsync(Guid userId, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "DELETE FROM auth.UserFcmTokens WHERE UserId = @UserId",
            new { UserId = userId });
}
