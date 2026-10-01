namespace Bugie.Auth.Domain.Interfaces;

/// <summary>
/// Servicio centralizado para verificar permisos de un usuario admin.
///
/// Encapsula la regla "super_admin tiene TODO": en cualquier checkeo de
/// permiso, primero validamos si el rol del usuario es IsSystem=TRUE y, en ese
/// caso, devolvemos true sin consultar RolePermissions.
/// </summary>
public interface IPermissionService
{
    /// <summary>
    /// Lista de permisos efectivos del usuario. Para super_admin devuelve
    /// el catálogo completo (Permissions.All). Para otros, lo que tenga
    /// en RolePermissions. Si el user no tiene rol asignado o no es admin,
    /// devuelve lista vacía.
    /// </summary>
    Task<List<string>> GetUserPermissionsAsync(Guid userId, CancellationToken ct = default);

    /// <summary>True si el user tiene el permiso especificado.</summary>
    Task<bool> HasPermissionAsync(Guid userId, string permission, CancellationToken ct = default);
}
