using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

/// <summary>Fila del listado admin de tickets de un sorteo.</summary>
public class RaffleTicketAdminRow
{
    public string   TicketNumber { get; set; } = string.Empty;
    public Guid     UserId       { get; set; }
    public string?  UserName     { get; set; }
    public string?  UserRole     { get; set; }
    public string   Source       { get; set; } = string.Empty;
    public DateTime CreatedAt    { get; set; }
    public bool     IsWinner     { get; set; }
}

/// <param name="Total">Tickets que cumplen el filtro (para paginar).</param>
/// <param name="Participants">Usuarios distintos con tickets en el sorteo.</param>
/// <param name="BySource">Tickets del sorteo por origen.</param>
public record RaffleTicketsPage(
    List<RaffleTicketAdminRow> Items,
    int Total,
    int Participants,
    Dictionary<string, int> BySource);

public interface IRaffleRepository
{
    Task<List<Raffle>> GetAllAsync(CancellationToken ct = default);
    Task<List<Raffle>> GetOpenAsync(CancellationToken ct = default);

    /// <summary>Sorteos cuya fecha ya llegó y siguen sin sortearse.</summary>
    Task<List<Raffle>> GetDueAsync(CancellationToken ct = default);

    Task<Raffle?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task AddAsync(Raffle raffle, CancellationToken ct = default);
    Task UpdateAsync(Raffle raffle, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);

    // ── Tickets ──────────────────────────────────────────────────────────

    Task<List<RaffleTicket>> GetTicketsAsync(Guid raffleId, CancellationToken ct = default);
    Task<int> CountTicketsAsync(Guid raffleId, CancellationToken ct = default);

    /// <summary>Cuántos tickets tiene ese usuario en ese sorteo, por origen.</summary>
    Task<int> CountUserTicketsAsync(
        Guid raffleId, Guid userId, string? source, CancellationToken ct = default);

    /// <summary>
    /// Entrega tickets. Devuelve cuántos se crearon realmente: si el usuario
    /// ya los tenía, no se duplican.
    /// </summary>
    Task<int> GrantTicketsAsync(
        Guid raffleId, Guid userId, Guid profileId, int quantity,
        string source, Guid? referenceId, CancellationToken ct = default);

    /// <summary>
    /// Usa un cupon de ticket de sorteo, todo en UNA transaccion: bloquea el
    /// sorteo (debe seguir abierto y sin ejecutarse), marca el cupon como
    /// usado (debe ser del usuario, tipo raffle_ticket, activo y vigente) y
    /// crea los tickets con origen points_redemption.
    ///
    /// Devuelve los numeros de ticket creados; lista vacia si el sorteo ya no
    /// estaba abierto o el cupon ya no se podia usar.
    /// </summary>
    Task<List<string>> UseTicketCouponAsync(
        Guid raffleId, Guid userId, Guid profileId, Guid redemptionId,
        int quantity, string usedNote, CancellationToken ct = default);

    /// <summary>
    /// Admin: tickets de un sorteo, paginados, con nombre y rol del usuario
    /// (auth.users). search filtra por nombre o numero de ticket. Orden:
    /// ganadores primero, luego por numero de ticket. Los totales (participantes
    /// y por origen) son de todo el sorteo, sin el filtro.
    /// </summary>
    Task<RaffleTicketsPage> GetTicketsPageAsync(
        Guid raffleId, string? search, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Tickets de un usuario en los sorteos abiertos.</summary>
    Task<List<(Raffle Raffle, int Tickets)>> GetUserTicketsSummaryAsync(
        Guid userId, CancellationToken ct = default);

    // ── Ganadores ────────────────────────────────────────────────────────

    Task<List<RaffleWinner>> GetWinnersAsync(Guid raffleId, CancellationToken ct = default);
    Task<List<RaffleWinner>> GetWinnersByUserAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Guarda ganadores y marca el sorteo, todo en una transacción.</summary>
    Task SaveDrawAsync(Raffle raffle, IEnumerable<RaffleWinner> winners,
                       CancellationToken ct = default);

    Task UpdateWinnerAsync(RaffleWinner winner, CancellationToken ct = default);
    Task<RaffleWinner?> GetWinnerByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Ganador por su código de premio (PZ-XXXXXX).</summary>
    Task<RaffleWinner?> GetWinnerByPrizeCodeAsync(string prizeCode, CancellationToken ct = default);
}
