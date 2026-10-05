using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Auth.Api.Security;
using Bugie.Auth.Application.Queries;

namespace Bugie.Auth.Api.Controllers;

/// <summary>
/// Datos de usuarios en lote para otros microservicios (Drivers, Trips).
///
/// Seguridad: header X-Internal-Token (appsettings: InternalToken). No usa JWT.
/// Reemplaza el uso de GET /api/auth/users/bulk con el JWT del usuario
/// reenviado, que ahora solo devuelve datos públicos a quien no es admin.
/// </summary>
[ApiController]
[Route("api/internal/users")]
[AllowAnonymous] // El token interno protege este endpoint, no el JWT.
public class InternalUsersController : ControllerBase
{
    private const int MaxIds = 500;
    private readonly IMediator _mediator;
    private readonly IConfiguration _cfg;

    public InternalUsersController(IMediator mediator, IConfiguration cfg)
    {
        _mediator = mediator;
        _cfg = cfg;
    }

    /// <summary>
    /// GET /api/internal/users/bulk?ids=..&amp;ids=..&amp;includeDocument=false
    /// Perfil completo de cada usuario. El documento (tipo y número) solo va si
    /// includeDocument=true (Drivers lo pide cuando quien consulta es admin).
    /// </summary>
    [HttpGet("bulk")]
    public async Task<IActionResult> Bulk(
        [FromQuery(Name = "ids")] Guid[] ids,
        [FromQuery] bool includeDocument,
        CancellationToken ct)
    {
        if(!InternalTokenCheck.Matches(Request.Headers["X-Internal-Token"].ToString(), _cfg["InternalToken"]))
            return Unauthorized(new { error = "Token interno inválido." });

        var list = (ids ?? Array.Empty<Guid>()).Distinct().Take(MaxIds).ToArray();
        return Ok(await _mediator.Send(new GetUsersBulkQuery(list, includeDocument), ct));
    }

    /// <summary>
    /// GET /api/internal/users/{userId}/session-state
    /// Estado de la cuenta para validar el JWT en las otras APIs (ver
    /// Security/SessionState.cs): sello vigente, si ya se cambió alguna vez,
    /// eliminada, desactivada. 404 si la cuenta no existe.
    /// </summary>
    [HttpGet("{userId:guid}/session-state")]
    public async Task<IActionResult> SessionState(
        Guid userId, [FromServices] Bugie.Auth.Domain.Interfaces.IUserRepository users, CancellationToken ct)
    {
        if(!InternalTokenCheck.Matches(Request.Headers["X-Internal-Token"].ToString(), _cfg["InternalToken"]))
            return Unauthorized(new { error = "Token interno inválido." });

        var s = await users.GetSessionStateAsync(userId, ct);
        if(s is null) return NotFound(new { error = "Usuario no encontrado." });

        return Ok(new
        {
            userId = s.UserId,
            stamp = s.SecurityStamp,
            stampRotated = s.SecurityStampChangedAt.HasValue,
            stampChangedAt = s.SecurityStampChangedAt,
            isDeleted = s.IsDeleted,
            isDeactivated = s.IsDeactivated,
            isActive = s.IsActive,
            role = s.Role,
        });
    }
}
