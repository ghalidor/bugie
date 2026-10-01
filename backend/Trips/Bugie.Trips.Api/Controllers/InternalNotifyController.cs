using Bugie.Trips.Domain.External;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoints internos para que otros microservicios disparen broadcasts
/// SignalR sin tener acceso directo al hub (que vive aquí en Trips.Api).
///
/// Uso típico:
///   Drivers.Api recibe GPS de un conductor → llama POST /api/internal/notify/driver-location
///   → Trips.Api lo emite por SignalR al grupo "admins".
///
/// Seguridad:
///   - NO requiere JWT de usuario (es comunicación servidor-servidor).
///   - Requiere header X-Internal-Token que coincida con appsettings.InternalToken.
///   - Si el token no está configurado, devuelve 500 (configuración inválida).
///
/// Fire-and-forget desde el llamador: si esto falla, el GPS ya quedó en BD
/// de Drivers, solo se pierde el broadcast en tiempo real. El admin tiene
/// fallback con polling de 60s.
/// </summary>
[ApiController]
[Route("api/internal/notify")]
[AllowAnonymous] // El token interno protege estos endpoints, no el JWT.
public class InternalNotifyController : ControllerBase
{
    private readonly IAdminNotifier _notifier;
    private readonly IConfiguration _cfg;
    private readonly ILogger<InternalNotifyController> _log;

    public InternalNotifyController(IAdminNotifier notifier,
                                     IConfiguration cfg,
                                     ILogger<InternalNotifyController> log)
    {
        _notifier = notifier;
        _cfg = cfg;
        _log = log;
    }

    /// <summary>
    /// Valida el header X-Internal-Token contra el configurado en appsettings.
    /// Si está OK devuelve true; sino, retorna IActionResult de error.
    /// </summary>
    private bool ValidateInternalToken(string? token, out IActionResult? errorResult)
    {
        var expected = _cfg["InternalToken"];
        if(string.IsNullOrEmpty(expected))
        {
            _log.LogError("InternalToken no configurado en appsettings.");
            errorResult = StatusCode(500, new { error = "Configuración interna inválida." });
            return false;
        }
        if(string.IsNullOrEmpty(token) || token != expected)
        {
            errorResult = Unauthorized(new { error = "Token interno inválido." });
            return false;
        }
        errorResult = null;
        return true;
    }

    /// <summary>
    /// POST /api/internal/notify/driver-location
    /// Llamado por Drivers.Api cada vez que un conductor reporta GPS.
    /// </summary>
    [HttpPost("driver-location")]
    public async Task<IActionResult> NotifyDriverLocation(
        [FromHeader(Name = "X-Internal-Token")] string? token,
        [FromBody] NotifyDriverLocationRequest req,
        CancellationToken ct)
    {
        if(!ValidateInternalToken(token, out var err)) return err!;

        // Fire-and-forget: no esperamos a que el broadcast llegue.
        // Pero awaitamos para que cualquier error se loguee.
        await _notifier.NotifyDriverLocationAsync(
            req.UserId, req.Lat, req.Lng, req.HasActiveTrip, ct);
        return Ok();
    }

    /// <summary>
    /// POST /api/internal/notify/driver-offline
    /// Llamado por Drivers.Api cuando el conductor se desconecta.
    /// </summary>
    [HttpPost("driver-offline")]
    public async Task<IActionResult> NotifyDriverOffline(
        [FromHeader(Name = "X-Internal-Token")] string? token,
        [FromBody] NotifyDriverOfflineRequest req,
        CancellationToken ct)
    {
        if(!ValidateInternalToken(token, out var err)) return err!;
        await _notifier.NotifyDriverOfflineAsync(req.UserId, ct);
        return Ok();
    }
}

public record NotifyDriverLocationRequest(Guid UserId, double Lat, double Lng, bool HasActiveTrip);
public record NotifyDriverOfflineRequest(Guid UserId);
