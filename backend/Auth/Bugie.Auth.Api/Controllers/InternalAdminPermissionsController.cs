using Bugie.Auth.Api.Security;
using Bugie.Auth.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Auth.Api.Controllers;

/// <summary>
/// Permisos efectivos de un admin, para el filtro [RequirePermission] de las
/// otras APIs (Drivers, Trips, Payments, Landing, Rewards), que los cachean
/// unos segundos por usuario.
///
///   GET /api/internal/admins/{userId}/permissions
///   -> { isSuperAdmin, permissions: [...] }
///
/// super_admin: isSuperAdmin = true y el catalogo completo. Usuario que no es
/// admin, sin rol, inactivo o eliminado: { false, [] } (siempre 200).
/// Seguridad: header X-Internal-Token (appsettings: InternalToken), comparado
/// en tiempo constante. No usa JWT.
/// </summary>
[ApiController]
[Route("api/internal/admins")]
[AllowAnonymous] // El token interno protege este endpoint, no el JWT.
public class InternalAdminPermissionsController : ControllerBase
{
    private readonly IPermissionService _perms;
    private readonly IConfiguration _cfg;
    private readonly ILogger<InternalAdminPermissionsController> _log;

    public InternalAdminPermissionsController(IPermissionService perms, IConfiguration cfg,
                                              ILogger<InternalAdminPermissionsController> log)
    {
        _perms = perms;
        _cfg = cfg;
        _log = log;
    }

    [HttpGet("{userId:guid}/permissions")]
    public async Task<IActionResult> Get(Guid userId, CancellationToken ct)
    {
        var expected = _cfg["InternalToken"];
        if (string.IsNullOrEmpty(expected))
        {
            _log.LogError("InternalToken no configurado.");
            return StatusCode(500, new { error = "Configuracion interna invalida." });
        }
        if (!InternalTokenCheck.Matches(Request.Headers["X-Internal-Token"].ToString(), expected))
            return Unauthorized(new { error = "Token interno invalido." });

        var (isSuperAdmin, permissions) = await _perms.GetAdminAccessAsync(userId, ct);
        return Ok(new { isSuperAdmin, permissions });
    }
}
