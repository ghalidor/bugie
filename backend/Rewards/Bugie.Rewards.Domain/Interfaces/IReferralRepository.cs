using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

/// <summary>
/// Fila del ranking de quienes mas invitaron.
///
/// Con propiedades y no como record posicional: Dapper lo materializa desde
/// SQL, y asi mapea por nombre en vez de depender del orden de las columnas.
/// </summary>
public class TopReferrerRow
{
    public Guid     UserId       { get; set; }
    public string?  FullName     { get; set; }
    public string?  Email        { get; set; }
    public int      Invited      { get; set; }
    public int      Qualified    { get; set; }
    public int      PointsEarned { get; set; }
    public DateTime LastAt       { get; set; }
}

public interface IReferralRepository
{
    // ── Código ───────────────────────────────────────────────────────────
    Task<ReferralCode?> GetCodeByUserAsync(Guid userId, CancellationToken ct = default);
    Task<ReferralCode?> GetCodeByValueAsync(string code, CancellationToken ct = default);

    /// <summary>
    /// Inserta el código. Devuelve false si ese código ya existía, para que
    /// quien llama reintente con otro.
    /// </summary>
    Task<bool> TryAddCodeAsync(ReferralCode code, CancellationToken ct = default);

    // ── Referidos ────────────────────────────────────────────────────────

    /// <summary>
    /// Registra el referido. Devuelve false si ese usuario ya había sido
    /// reclamado por alguien, que es lo que impide contarlo dos veces.
    /// </summary>
    Task<bool> TryAddReferralAsync(Referral referral, CancellationToken ct = default);

    Task<Referral?> GetByReferredUserAsync(Guid referredUserId, CancellationToken ct = default);
    Task<List<Referral>> GetByReferrerAsync(Guid referrerUserId, CancellationToken ct = default);
    Task UpdateReferralAsync(Referral referral, CancellationToken ct = default);

    // ── Invitaciones ─────────────────────────────────────────────────────
    Task AddInvitationAsync(ReferralInvitation invitation, CancellationToken ct = default);
    Task<int> CountInvitationsTodayAsync(Guid referrerUserId, CancellationToken ct = default);
    Task MarkInvitationAcceptedAsync(string email, string code, CancellationToken ct = default);

    // ── Admin ────────────────────────────────────────────────────────────

    /// <summary>Totales del programa, en una sola consulta.</summary>
    Task<(int Total, int Qualified, int Points, int Codes, int Sent, int Accepted)>
        GetStatsAsync(CancellationToken ct = default);

    /// <summary>
    /// Quiénes más invitaron. Trae el nombre y el correo desde auth.users,
    /// porque el admin necesita saber de quién habla.
    /// </summary>
    Task<List<TopReferrerRow>> GetTopReferrersAsync(int take, CancellationToken ct = default);

    // ── Ranking entre amigos ─────────────────────────────────────────────

    /// <summary>
    /// Los usuarios conectados a este por referidos: a quienes invitó y quien
    /// lo invitó a él. Esos son sus "amigos" dentro de Bugie.
    /// </summary>
    Task<List<Guid>> GetFriendIdsAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Puntos y viajes de esos usuarios en el mes indicado.</summary>
    Task<List<FriendPoints>> GetMonthlyPointsAsync(
        IEnumerable<Guid> userIds, DateTime monthStartUtc, DateTime monthEndUtc,
        CancellationToken ct = default);
}

/// <summary>Puntos de un usuario en el mes, para el ranking.</summary>
public class FriendPoints
{
    public Guid    UserId   { get; set; }
    public string? FullName { get; set; }
    public string  Level    { get; set; } = string.Empty;
    public int     Points   { get; set; }
    public int     Trips    { get; set; }
}
