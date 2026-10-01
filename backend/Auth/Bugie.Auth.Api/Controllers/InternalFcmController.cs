using Bugie.Auth.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Auth.Api.Controllers;

/// <summary>
/// Endpoints internos para que otros microservicios (Trips.Api) consulten
/// y administren tokens FCM SIN tener acceso a la BD de Auth directamente.
///
/// Seguridad:
///   - NO requiere JWT de usuario (comunicación servidor-servidor).
///   - Requiere header X-Internal-Token que coincida con appsettings.
///   - Si el token no coincide, devuelve 401.
///
/// Quién los consume:
///   - Trips.Api/FcmSender → GET /api/internal/fcm-tokens/by-users
///     para conseguir los tokens de los conductores a notificar.
///   - Trips.Api/FcmSender → DELETE /api/internal/fcm-tokens/{token}
///     cuando FCM responde UNREGISTERED (token inválido) y hay que
///     borrarlo para no seguir intentándolo.
/// </summary>
[ApiController]
[Route("api/internal/fcm-tokens")]
[AllowAnonymous] // El token interno protege estos endpoints, no el JWT.
public class InternalFcmController : ControllerBase
{
    private readonly IUserFcmTokenRepository _tokens;
    private readonly IConfiguration _cfg;
    private readonly ILogger<InternalFcmController> _log;

    public InternalFcmController(
        IUserFcmTokenRepository tokens,
        IConfiguration cfg,
        ILogger<InternalFcmController> log)
    {
        _tokens = tokens;
        _cfg = cfg;
        _log = log;
    }

    /// <summary>
    /// Valida X-Internal-Token contra appsettings. Si no coincide,
    /// retorna 401; si appsettings no lo tiene, 500.
    /// </summary>
    private bool ValidateInternal(out IActionResult? errorResult)
    {
        var expected = _cfg["InternalToken"];
        if(string.IsNullOrEmpty(expected))
        {
            _log.LogError("InternalToken no configurado.");
            errorResult = StatusCode(500, new { error = "Configuración interna inválida." });
            return false;
        }
        var received = Request.Headers["X-Internal-Token"].ToString();
        if(string.IsNullOrEmpty(received) || received != expected)
        {
            errorResult = Unauthorized(new { error = "Token interno inválido." });
            return false;
        }
        errorResult = null;
        return true;
    }

    /// <summary>
    /// GET /api/internal/fcm-tokens/by-users?ids=GUID&ids=GUID
    /// Devuelve los tokens FCM de varios usuarios.
    /// </summary>
    [HttpGet("by-users")]
    public async Task<IActionResult> GetByUsers(
        [FromQuery] List<Guid> ids, CancellationToken ct)
    {
        if(!ValidateInternal(out var err)) return err!;
        if(ids is null || ids.Count == 0)
            return Ok(Array.Empty<object>());

        var tokens = await _tokens.GetByUserIdsAsync(ids, ct);
        return Ok(tokens.Select(t => new {
            t.UserId,
            t.Token,
            t.Platform
        }));
    }

    /// <summary>
    /// DELETE /api/internal/fcm-tokens/{token}
    /// Borra un token específico (lo invoca Trips cuando FCM dice
    /// UNREGISTERED para no seguir intentando con un token muerto).
    /// </summary>
    [HttpDelete("{token}")]
    public async Task<IActionResult> Delete(string token, CancellationToken ct)
    {
        if(!ValidateInternal(out var err)) return err!;
        await _tokens.DeleteByTokenAsync(token, ct);
        return Ok(new { deleted = true });
    }
}
