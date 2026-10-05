namespace Bugie.Drivers.Domain.Entities;

/// <summary>
/// Registro de auditoría de la cuenta del conductor (línea de tiempo de estados):
/// aprobación normal, por excepción, completó documentos, desactivación automática,
/// rechazo, suspensión, reactivación, solicitudes de revisión y vencimiento de documentos.
/// </summary>
public class ApprovalAudit
{
    // Acciones posibles (columna Action)
    public const string ActionApproved = "approved";
    public const string ActionApprovedException = "approved_exception";
    public const string ActionDocumentsCompleted = "documents_completed";
    public const string ActionAutoDeactivated = "auto_deactivated";
    public const string ActionRejected = "rejected";
    public const string ActionSuspended = "suspended";
    public const string ActionReactivated = "reactivated";
    public const string ActionAutoReactivated = "auto_reactivated";
    public const string ActionReviewRequested = "review_requested";
    public const string ActionReviewKept = "review_kept";
    public const string ActionExpired = "expired";

    // Quién hizo la acción (columna ActorRole)
    public const string RoleAdmin = "admin";
    public const string RoleSystem = "system";
    public const string RoleDriver = "driver";

    public Guid Id { get; private set; }
    public Guid DriverId { get; private set; }
    public string Action { get; private set; } = string.Empty;
    public Guid? AdminUserId { get; private set; }     // quién hizo la acción (NULL = sistema)
    public string? AdminName { get; private set; }     // nombre de quien hizo la acción
    public string? Reason { get; private set; }
    public string? MissingDocs { get; private set; }   // tipos separados por coma
    public DateTime? Deadline { get; private set; }    // plazo de documentos o fin de suspensión
    public short? FromStatus { get; private set; }     // estado antes (NULL = no cambió)
    public short? ToStatus { get; private set; }       // estado después (NULL = no cambió)
    public string? ActorRole { get; private set; }     // admin | system | driver
    public DateTime CreatedAt { get; private set; }

    private ApprovalAudit() { }

    /// <param name="actorRole">NULL = "system" si no hay usuario, si no "admin".</param>
    public static ApprovalAudit Create(
        Guid driverId, string action, Guid? adminUserId, string? adminName,
        string? reason, IEnumerable<string>? missingDocs, DateTime? deadline,
        int? fromStatus = null, int? toStatus = null, string? actorRole = null) => new()
        {
            Id = Guid.NewGuid(),
            DriverId = driverId,
            Action = action,
            AdminUserId = adminUserId,
            AdminName = adminName,
            Reason = reason,
            MissingDocs = missingDocs is null ? null : string.Join(",", missingDocs),
            Deadline = deadline,
            FromStatus = (short?)fromStatus,
            ToStatus = (short?)toStatus,
            ActorRole = actorRole ?? (adminUserId is null ? RoleSystem : RoleAdmin),
            CreatedAt = DateTime.UtcNow,
        };
}
