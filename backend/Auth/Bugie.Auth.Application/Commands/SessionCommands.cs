using MediatR;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Domain.Common;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

// =====================================================================
// Sesiones (sello de seguridad, claim "sst" del JWT):
//  - Admin: cerrar todas las sesiones de un usuario.
//  - Admin: reactivar una cuenta desactivada.
// La desactivacion esta en DeactivateUserHandler. El cambio de contrasena,
// el restablecimiento por correo y la eliminacion de la cuenta tambien
// cambian el sello (ver sus handlers).
// =====================================================================

public static class SessionRules
{
    public const int ReasonMax = 500;

    /// <summary>Motivo opcional: null si viene vacio; 400 si supera ReasonMax.</summary>
    public static string? OptionalReason(string? reason)
    {
        var r = reason?.Trim();
        if(string.IsNullOrEmpty(r)) return null;
        if(r.Length > ReasonMax)
            throw new InvalidOperationException($"El motivo no puede superar {ReasonMax} caracteres.");
        return r;
    }
}

// ── Admin: cerrar todas las sesiones ────────────────────────────────────
public record RevokeSessionsCommand(Guid AdminUserId, string? AdminName, Guid UserId, string? Reason) : IRequest<bool>;

public class RevokeSessionsHandler : IRequestHandler<RevokeSessionsCommand, bool>
{
    private readonly IUserRepository _users;
    private readonly IUserAccountAuditRepository _audit;

    public RevokeSessionsHandler(IUserRepository users, IUserAccountAuditRepository audit)
        => (_users, _audit) = (users, audit);

    public async Task<bool> Handle(RevokeSessionsCommand cmd, CancellationToken ct)
    {
        var reason = SessionRules.OptionalReason(cmd.Reason);
        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        await _users.RotateSecurityStampAsync(user.Id, ct);

        await _audit.AddAsync(UserAccountAudit.Create(user.Id, UserAccountAudit.ActionSessionsRevoked,
            cmd.AdminUserId, cmd.AdminName, UserAccountAudit.RoleAdmin, reason), ct);
        return true;
    }
}

// ── Admin: reactivar una cuenta desactivada ─────────────────────────────
public record ReactivateUserCommand(Guid AdminUserId, string? AdminName, Guid UserId, string? Reason)
    : IRequest<UserProfileDto>;

public class ReactivateUserHandler : IRequestHandler<ReactivateUserCommand, UserProfileDto>
{
    private readonly IUserRepository _users;
    private readonly IUserAccountAuditRepository _audit;

    public ReactivateUserHandler(IUserRepository users, IUserAccountAuditRepository audit)
        => (_users, _audit) = (users, audit);

    public async Task<UserProfileDto> Handle(ReactivateUserCommand cmd, CancellationToken ct)
    {
        var reason = SessionRules.OptionalReason(cmd.Reason);
        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if(!user.IsDeactivated)
            throw new ConflictException("La cuenta no está desactivada.");

        var deactivatedAt = user.DeactivatedAt;
        user.Reactivate();
        await _users.UpdateDeactivationAsync(user, ct);

        await _audit.AddAsync(UserAccountAudit.Create(user.Id, UserAccountAudit.ActionReactivated,
            cmd.AdminUserId, cmd.AdminName, UserAccountAudit.RoleAdmin, reason,
            deactivatedAt is null ? "Desactivada" : $"Desactivada el {BugieTime.ToPeru(deactivatedAt.Value):dd/MM/yyyy HH:mm}",
            "Activa"), ct);

        return UserProfileDto.From(user);
    }
}
