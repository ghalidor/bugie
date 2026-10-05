using MediatR;

namespace Bugie.Auth.Application.Commands;

/// <summary>Admin: desactivar una cuenta (motivo opcional, auditado). Cierra todas sus sesiones.</summary>
public record DeactivateUserCommand(Guid UserId, Guid? AdminUserId = null, string? AdminName = null, string? Reason = null)
    : IRequest<bool>;
