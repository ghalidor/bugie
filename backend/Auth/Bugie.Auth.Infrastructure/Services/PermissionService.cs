using Bugie.Auth.Domain.Constants;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Services;

/// <summary>
/// Lógica de permisos. Detecta super_admin (IsSystem=TRUE) y devuelve TODO el catálogo;
/// para roles normales, consulta RolePermissions.
/// </summary>
public class PermissionService : IPermissionService
{
    private readonly IUserRepository _users;
    private readonly IAdminRoleRepository _roles;

    public PermissionService(IUserRepository users, IAdminRoleRepository roles)
    {
        _users = users;
        _roles = roles;
    }

    public async Task<List<string>> GetUserPermissionsAsync(
        Guid userId, CancellationToken ct = default)
    {
        var user = await _users.GetByIdAsync(userId, ct);
        // Solo los admins tienen permisos administrativos. Para los otros roles
        // devolvemos lista vacía (no se les muestra el panel admin nunca).
        if(user is null || user.Role != "admin" || user.AdminRoleId is null)
            return new List<string>();

        var role = await _roles.GetByIdAsync(user.AdminRoleId.Value, ct);
        if(role is null) return new List<string>();

        // super_admin: TODO el catálogo, sin consultar BD.
        if(role.IsSystem) return Permissions.All.ToList();

        // Roles normales: lo que esté en RolePermissions.
        return await _roles.GetPermissionsAsync(role.Id, ct);
    }

    public async Task<bool> HasPermissionAsync(
        Guid userId, string permission, CancellationToken ct = default)
    {
        var perms = await GetUserPermissionsAsync(userId, ct);
        return perms.Contains(permission);
    }
}
