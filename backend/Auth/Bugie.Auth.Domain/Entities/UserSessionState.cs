namespace Bugie.Auth.Domain.Entities;

/// <summary>
/// Estado de la cuenta que se compara con el JWT en cada request
/// (sello de seguridad, eliminada, desactivada). Lo lee Auth de la BD y las
/// otras APIs por GET /api/internal/users/{userId}/session-state.
/// </summary>
public record UserSessionState(
    Guid UserId,
    Guid SecurityStamp,
    DateTime? SecurityStampChangedAt,
    bool IsActive,
    bool IsDeleted,
    bool IsDeactivated,
    string Role);
