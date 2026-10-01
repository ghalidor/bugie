using System.Data;
using Dapper;
using Npgsql;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class ReferralRepository : IReferralRepository
{
    private readonly IDbConnection _db;
    public ReferralRepository(IDbConnection db) => _db = db;

    /// <summary>Código SQL de violación de clave única en Postgres.</summary>
    private const string UniqueViolation = "23505";

    /* ── Código ──────────────────────────────────────────────────────── */

    public Task<ReferralCode?> GetCodeByUserAsync(Guid userId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<ReferralCode>(
            "SELECT * FROM rewards.ReferralCodes WHERE UserId = @UserId",
            new { UserId = userId });

    public Task<ReferralCode?> GetCodeByValueAsync(string code, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<ReferralCode>(
            "SELECT * FROM rewards.ReferralCodes WHERE upper(Code) = upper(@Code)",
            new { Code = code });

    /// <summary>
    /// false si el código ya estaba tomado. No se consulta antes de insertar:
    /// entre la consulta y el INSERT podría colarse otro, y el único árbitro
    /// confiable es el índice único de la base.
    /// </summary>
    public async Task<bool> TryAddCodeAsync(ReferralCode code, CancellationToken ct = default)
    {
        try
        {
            await _db.ExecuteAsync(@"
                INSERT INTO rewards.ReferralCodes (Id, UserId, Code, CreatedAt)
                VALUES (@Id, @UserId, @Code, @CreatedAt)",
                code);
            return true;
        }
        catch (PostgresException ex) when (ex.SqlState == UniqueViolation)
        {
            return false;
        }
    }

    /* ── Referidos ───────────────────────────────────────────────────── */

    /// <summary>
    /// false si ese usuario ya había sido reclamado, o si se intentó
    /// autorreferir. Las dos cosas las rechaza la base, no el código.
    /// </summary>
    public async Task<bool> TryAddReferralAsync(Referral r, CancellationToken ct = default)
    {
        try
        {
            await _db.ExecuteAsync(@"
                INSERT INTO rewards.Referrals
                    (Id, ReferrerUserId, ReferredUserId, ReferredUserType, Code,
                     Status, TripsCompleted, SignupPoints, QualifyPoints, CreatedAt, QualifiedAt)
                VALUES
                    (@Id, @ReferrerUserId, @ReferredUserId, @ReferredUserType, @Code,
                     @Status, @TripsCompleted, @SignupPoints, @QualifyPoints, @CreatedAt, @QualifiedAt)",
                r);
            return true;
        }
        catch (PostgresException ex) when (ex.SqlState is UniqueViolation or "23514")
        {
            // 23505 = ya lo reclamaron. 23514 = intentó referirse a sí mismo.
            return false;
        }
    }

    public Task<Referral?> GetByReferredUserAsync(Guid referredUserId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Referral>(
            "SELECT * FROM rewards.Referrals WHERE ReferredUserId = @Id",
            new { Id = referredUserId });

    public async Task<List<Referral>> GetByReferrerAsync(Guid referrerUserId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Referral>(@"
            SELECT * FROM rewards.Referrals
            WHERE ReferrerUserId = @Id ORDER BY CreatedAt DESC",
            new { Id = referrerUserId });
        return rows.ToList();
    }

    public Task UpdateReferralAsync(Referral r, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.Referrals SET
                Status         = @Status,
                TripsCompleted = @TripsCompleted,
                SignupPoints   = @SignupPoints,
                QualifyPoints  = @QualifyPoints,
                QualifiedAt    = @QualifiedAt
            WHERE Id = @Id",
            r);

    /* ── Invitaciones ────────────────────────────────────────────────── */

    public Task AddInvitationAsync(ReferralInvitation i, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO rewards.ReferralInvitations
                (Id, ReferrerUserId, Email, Code, SentAt, AcceptedAt)
            VALUES
                (@Id, @ReferrerUserId, @Email, @Code, @SentAt, @AcceptedAt)",
            i);

    /// <summary>
    /// Invitaciones enviadas hoy por ese usuario. Sirve para poner un tope y
    /// que nadie use el sistema para mandar correo masivo.
    /// </summary>
    public Task<int> CountInvitationsTodayAsync(Guid referrerUserId, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM rewards.ReferralInvitations
            WHERE ReferrerUserId = @Id AND SentAt >= date_trunc('day', now())",
            new { Id = referrerUserId });

    public Task MarkInvitationAcceptedAsync(string email, string code, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.ReferralInvitations
            SET AcceptedAt = now()
            WHERE lower(Email) = lower(@Email)
              AND upper(Code)  = upper(@Code)
              AND AcceptedAt IS NULL",
            new { Email = email, Code = code });
}
