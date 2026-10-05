using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Domain.Interfaces;

public interface IComplaintRepository
{
    /// <summary>Siguiente correlativo del anio (atomico).</summary>
    Task<int> NextSeqAsync(int year, CancellationToken ct = default);
    Task AddAsync(Complaint c, CancellationToken ct = default);
    /// <summary>Id del viaje cuyo id empieza con ese codigo (minimo 6 caracteres); null si no hay o si hay varios.</summary>
    Task<Guid?> FindTripIdByCodeAsync(string code, CancellationToken ct = default);
    Task<Complaint?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Complaint?> GetByCodeAsync(string code, CancellationToken ct = default);
    Task SetConfirmationEmailSentAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Listado admin. status: pendiente | por_vencer | vencida | respondida | null (todas:
    /// todo menos los posibles bots pendientes), posible_bot | descartada | anulada.
    /// type: 'reclamo' | 'queja' | null. today = dia de Peru.
    /// fromUtc / toUtc: rango de CreatedAt en UTC (toUtc excluyente), opcionales.
    /// </summary>
    Task<(List<Complaint> items, int total)> GetPagedAsync(
        string? status, string? type, string? search, DateTime today, DateTime dueSoonLimit,
        int page, int pageSize, CancellationToken ct = default,
        DateTime? fromUtc = null, DateTime? toUtc = null);

    /// <summary>
    /// Conteos: pendientes (incluye vencidas), por vencer, vencidas y respondidas
    /// (sin posibles bots), mas posibles bots sin revisar, descartadas y anuladas.
    /// </summary>
    Task<ComplaintStats> GetStatsAsync(DateTime today, DateTime dueSoonLimit, CancellationToken ct = default);

    /// <summary>Posible bot pendiente -> 'descartada' con motivo. false si no aplica.</summary>
    Task<bool> DiscardBotAsync(Guid id, string reason, Guid adminId, string adminName,
        DateTime at, CancellationToken ct = default);
    /// <summary>Hoja pendiente (incluido posible bot) -> 'anulada' con motivo. false si no aplica.</summary>
    Task<bool> VoidAsync(Guid id, string reason, Guid adminId, string adminName,
        DateTime at, CancellationToken ct = default);
    /// <summary>Posible bot pendiente -> valida, con nueva fecha limite y plazo. false si no aplica.</summary>
    Task<bool> MarkValidAsync(Guid id, string dueDate, int responseDays, CancellationToken ct = default);

    /// <summary>Guarda la respuesta. Devuelve false si ya estaba respondida.</summary>
    Task<bool> SaveResponseAsync(Guid id, string response, Guid adminId, string adminName,
        DateTime respondedAt, CancellationToken ct = default);
    Task SetResponseEmailSentAsync(Guid id, CancellationToken ct = default);
}

public record ComplaintStats(int Pending, int DueSoon, int Overdue, int Answered, int Bots, int Discarded, int Voided);
