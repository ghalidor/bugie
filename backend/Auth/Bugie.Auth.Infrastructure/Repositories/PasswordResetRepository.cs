using System.Data;
using Bugie.Auth.Domain.Interfaces;
using Dapper;

namespace Bugie.Auth.Infrastructure.Repositories;

public class PasswordResetRepository : IPasswordResetRepository
{
    private readonly IDbConnection _db;
    public PasswordResetRepository(IDbConnection db) => _db = db;

    public Task InvalidatePendingAsync(Guid userId, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE auth.PasswordResetTokens
               SET UsedAt = (now() AT TIME ZONE 'utc')
             WHERE UserId = @UserId AND UsedAt IS NULL",
            new { UserId = userId });

    public Task AddAsync(Guid userId, string tokenHash, DateTime expiresAtUtc, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO auth.PasswordResetTokens (UserId, TokenHash, ExpiresAt)
            VALUES (@UserId, @TokenHash, @ExpiresAt)",
            new { UserId = userId, TokenHash = tokenHash, ExpiresAt = expiresAtUtc });

    public Task<bool> IsValidAsync(string tokenHash, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<bool>(@"
            SELECT EXISTS (
                SELECT 1 FROM auth.PasswordResetTokens
                 WHERE TokenHash = @TokenHash
                   AND UsedAt IS NULL
                   AND ExpiresAt > (now() AT TIME ZONE 'utc'))",
            new { TokenHash = tokenHash });

    public Task<Guid?> ConsumeAsync(string tokenHash, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<Guid?>(@"
            UPDATE auth.PasswordResetTokens
               SET UsedAt = (now() AT TIME ZONE 'utc')
             WHERE TokenHash = @TokenHash
               AND UsedAt IS NULL
               AND ExpiresAt > (now() AT TIME ZONE 'utc')
            RETURNING UserId",
            new { TokenHash = tokenHash });

    public Task UpdatePasswordHashAsync(Guid userId, string passwordHash, CancellationToken ct = default) =>
        _db.ExecuteAsync(
            "UPDATE auth.Users SET PasswordHash = @Hash WHERE Id = @Id",
            new { Id = userId, Hash = passwordHash });
}
