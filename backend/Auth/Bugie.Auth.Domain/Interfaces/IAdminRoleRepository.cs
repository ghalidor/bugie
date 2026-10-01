using Bugie.Auth.Domain.Entities;

namespace Bugie.Auth.Domain.Interfaces;

/// <summary>
/// Repositorio de roles administrativos y sus permisos.
/// </summary>
public interface IAdminRoleRepository
{
    Task<List<AdminRole>> GetAllAsync(CancellationToken ct = default);
    Task<AdminRole?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<AdminRole?> GetByNameAsync(string name, CancellationToken ct = default);

    /// <summary>
    /// Lista los permisos asignados a un rol. Devuelve los strings tal como
    /// están en BD (ej. "view:trips"). El catálogo de permisos válidos vive
    /// en Domain.Constants.Permissions.
    /// </summary>
    Task<List<string>> GetPermissionsAsync(Guid roleId, CancellationToken ct = default);

    Task AddAsync(AdminRole role, CancellationToken ct = default);
    Task UpdateAsync(AdminRole role, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);

    /// <summary>Reemplaza TODOS los permisos del rol con la lista dada.</summary>
    Task SetPermissionsAsync(Guid roleId, IEnumerable<string> permissions, CancellationToken ct = default);

    /// <summary>Cuántos usuarios tienen asignado este rol (para mostrar en UI).</summary>
    Task<int> GetUserCountAsync(Guid roleId, CancellationToken ct = default);
}
