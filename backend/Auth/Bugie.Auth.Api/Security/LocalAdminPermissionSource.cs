using Bugie.Auth.Domain.Interfaces;
using Bugie.Security;

namespace Bugie.Auth.Api.Security;

/// <summary>
/// Fuente de permisos del filtro [RequirePermission] dentro de Auth: lectura
/// directa con IPermissionService (sin HTTP ni cache, los cambios de rol se
/// aplican al instante). Las otras APIs usan HttpAdminPermissionSource.
/// </summary>
public sealed class LocalAdminPermissionSource : IAdminPermissionSource
{
    private readonly IPermissionService _perms;

    public LocalAdminPermissionSource(IPermissionService perms) => _perms = perms;

    public async Task<AdminPermissionSet> GetAsync(Guid userId, CancellationToken ct)
    {
        try
        {
            var (isSuperAdmin, permissions) = await _perms.GetAdminAccessAsync(userId, ct);
            return new AdminPermissionSet(isSuperAdmin, permissions);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            throw new AdminPermissionsUnavailableException("No se pudieron leer los permisos.", ex);
        }
    }
}
