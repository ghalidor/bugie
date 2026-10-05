using Bugie.Auth.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Auth.Api.Controllers;

/// <summary>
/// Contacto de emergencia de un usuario para otros microservicios.
///
/// Seguridad: igual que InternalNotifyController, requiere el header
/// X-Internal-Token (appsettings: InternalToken). No usa JWT.
///
/// Quién lo consume:
///   - Trips.Api → al activar un SOS, para avisar por correo al contacto.
/// </summary>
[ApiController]
[Route("api/internal/emergency-contact")]
[AllowAnonymous] // El token interno protege este endpoint, no el JWT.
public class InternalEmergencyContactController : ControllerBase
{
    private readonly IEmergencyContactRepository _contacts;
    private readonly IConfiguration _cfg;

    public InternalEmergencyContactController(IEmergencyContactRepository contacts, IConfiguration cfg)
    {
        _contacts = contacts;
        _cfg = cfg;
    }

    /// <summary>
    /// GET /api/internal/emergency-contact/{userId}
    /// 200 con el contacto, o 404 si el usuario no registró uno.
    /// </summary>
    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> Get(Guid userId, CancellationToken ct)
    {
        var expected = _cfg["InternalToken"];
        if(!Bugie.Auth.Api.Security.InternalTokenCheck.Matches(Request.Headers["X-Internal-Token"].ToString(), expected))
            return Unauthorized(new { error = "Token interno inválido." });

        var contact = await _contacts.GetByUserIdAsync(userId, ct);
        if(contact is null) return NotFound(new { error = "Sin contacto de emergencia." });
        return Ok(EmergencyContactController.ToDto(contact));
    }
}
