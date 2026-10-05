using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

public interface IApprovalAuditRepository
{
    Task AddAsync(ApprovalAudit audit, CancellationToken ct = default);

    /// <summary>Historial de un conductor (más reciente primero).</summary>
    Task<List<ApprovalAuditRow>> GetByDriverAsync(Guid driverId, CancellationToken ct = default);

    /// <summary>Lista general paginada (más reciente primero). Devuelve (items, total).</summary>
    Task<(List<ApprovalAuditRow> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string? action, CancellationToken ct = default);

    /// <summary>
    /// Último cambio de estado del conductor (aprobación, rechazo, suspensión,
    /// reactivación, desactivación automática o vencimiento). NULL si no hay.
    /// </summary>
    Task<ApprovalAuditRow?> GetLastStatusChangeAsync(Guid driverId, CancellationToken ct = default);
}

/// <summary>Fila de auditoría con el nombre del conductor (para listar).</summary>
public class ApprovalAuditRow
{
    public Guid Id { get; set; }
    public Guid DriverId { get; set; }
    public string? DriverName { get; set; }
    public string Action { get; set; } = string.Empty;
    public Guid? AdminUserId { get; set; }
    public string? AdminName { get; set; }
    public string? Reason { get; set; }
    public string? MissingDocs { get; set; }
    public DateTime? Deadline { get; set; }
    public short? FromStatus { get; set; }
    public short? ToStatus { get; set; }
    public string? ActorRole { get; set; }
    public DateTime CreatedAt { get; set; }
}
