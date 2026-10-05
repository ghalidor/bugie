using MediatR;
using Bugie.Auth.Domain.Common;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

/// <summary>
/// Desactiva la cuenta: DeactivatedAt (bloquea login y token, ver
/// SessionValidation), IsActive = false como antes, sello nuevo (cierra todas
/// sus sesiones) y auditoria. Si es conductor, se le saca de linea (best-effort).
/// </summary>
public class DeactivateUserHandler : IRequestHandler<DeactivateUserCommand, bool>
{
    private readonly IUserRepository _users;
    private readonly IUserAccountAuditRepository _audit;
    private readonly IDriversClient _drivers;

    public DeactivateUserHandler(IUserRepository users, IUserAccountAuditRepository audit,
        IDriversClient drivers)
        => (_users, _audit, _drivers) = (users, audit, drivers);

    public async Task<bool> Handle(DeactivateUserCommand cmd, CancellationToken ct)
    {
        var reason = SessionRules.OptionalReason(cmd.Reason);
        var user = await _users.GetByIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Usuario no encontrado.");

        if(user.IsDeleted)
            throw new ConflictException("La cuenta está eliminada: no se puede desactivar.");
        if(user.IsDeactivated)
            throw new ConflictException("La cuenta ya está desactivada.");

        user.Deactivate(reason);
        await _users.UpdateDeactivationAsync(user, ct);
        await _users.RotateSecurityStampAsync(user.Id, ct);

        await _audit.AddAsync(UserAccountAudit.Create(user.Id, UserAccountAudit.ActionDeactivated,
            cmd.AdminUserId, cmd.AdminName, UserAccountAudit.RoleAdmin, reason, null, "Desactivada"), ct);

        // Conductor en linea: que deje de verse en el mapa. Best-effort: si falla,
        // DriversClient lo registra en el log y la desactivacion sigue en pie.
        if(user.Role == "driver")
            await _drivers.NotifyAccountDeletedAsync(user.Id, ct);

        return true;
    }
}
