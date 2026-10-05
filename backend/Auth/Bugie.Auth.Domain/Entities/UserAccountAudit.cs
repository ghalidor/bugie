namespace Bugie.Auth.Domain.Entities;

/// <summary>
/// Auditoría de la cuenta (auth.useraccountaudit): eliminar, restaurar y
/// cambios de documento / nombres, desactivar / reactivar y cierre de
/// sesiones por el admin. Solo se inserta, nunca se modifica.
/// </summary>
public class UserAccountAudit
{
    public const string ActionDeleted = "deleted";
    public const string ActionRestored = "restored";
    public const string ActionDocumentChanged = "document_changed";
    public const string ActionNamesChanged = "names_changed";
    public const string ActionProfileCompleted = "profile_completed";
    public const string ActionDeactivated = "deactivated";
    public const string ActionReactivated = "reactivated";
    public const string ActionSessionsRevoked = "sessions_revoked";

    public const string RoleUser = "user";
    public const string RoleAdmin = "admin";

    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public Guid? ActorUserId { get; set; }
    public string? ActorName { get; set; }
    public string ActorRole { get; set; } = RoleUser;
    public string? Reason { get; set; }
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public DateTime CreatedAt { get; set; }

    public static UserAccountAudit Create(Guid userId, string action, Guid? actorUserId, string? actorName,
        string actorRole, string? reason, string? oldValue = null, string? newValue = null) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Action = action,
        ActorUserId = actorUserId,
        ActorName = actorName,
        ActorRole = actorRole,
        Reason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim(),
        OldValue = oldValue,
        NewValue = newValue,
        CreatedAt = DateTime.UtcNow,
    };
}
