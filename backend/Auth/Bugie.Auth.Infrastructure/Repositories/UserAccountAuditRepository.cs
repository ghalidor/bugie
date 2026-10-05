using System.Data;
using Dapper;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Repositories;

public class UserAccountAuditRepository : IUserAccountAuditRepository
{
    private readonly IDbConnection _db;
    public UserAccountAuditRepository(IDbConnection db) => _db = db;

    public Task AddAsync(UserAccountAudit a, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO auth.UserAccountAudit
                (Id, UserId, Action, ActorUserId, ActorName, ActorRole, Reason, OldValue, NewValue, CreatedAt)
            VALUES
                (@Id, @UserId, @Action, @ActorUserId, @ActorName, @ActorRole, @Reason, @OldValue, @NewValue, @CreatedAt)",
            a);

    public async Task<List<UserAccountAudit>> GetByUserAsync(Guid userId, CancellationToken ct = default) =>
        (await _db.QueryAsync<UserAccountAudit>(
            "SELECT * FROM auth.UserAccountAudit WHERE UserId = @Id ORDER BY CreatedAt DESC",
            new { Id = userId })).ToList();
}
