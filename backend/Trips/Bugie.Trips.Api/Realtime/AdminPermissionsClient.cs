using Bugie.Security;

namespace Bugie.Trips.Api.Realtime;

/// <summary>
/// Permisos del admin que hace la peticion, para filtrar el historial de avisos.
/// Usa la misma fuente que el filtro [RequirePermission]
/// (GET {Services:AuthApi}/api/internal/admins/{userId}/permissions con
/// X-Internal-Token, cacheado unos segundos por usuario).
/// Para super_admin Auth devuelve el catalogo completo (ve todo).
/// Si Auth no responde devuelve lista vacia: el admin solo ve los avisos sin
/// permiso (mejor ocultar que mostrar de mas).
/// </summary>
public class AdminPermissionsClient
{
    private readonly ILogger<AdminPermissionsClient> _log;

    public AdminPermissionsClient(ILogger<AdminPermissionsClient> log) => _log = log;

    public async Task<IReadOnlyCollection<string>> GetAsync(HttpRequest request, CancellationToken ct)
    {
        try
        {
            var set = await request.HttpContext.GetAdminPermissionsAsync();
            return set.Permissions;
        }
        catch (AdminPermissionsUnavailableException ex)
        {
            _log.LogWarning("Permisos del admin: {Error}", ex.Message);
            return Array.Empty<string>();
        }
    }
}
