using Bugie.Trips.Api.Realtime;
using Bugie.Trips.Application.Services;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
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
    private readonly DriverLocationRelayService _relay;
    private readonly IFcmSender _fcm;
    private readonly IConfiguration _cfg;
    private readonly ILogger<InternalNotifyController> _log;

    public InternalNotifyController(IAdminNotifier notifier,
                                     DriverLocationRelayService relay,
                                     IFcmSender fcm,
                                     IConfiguration cfg,
                                     ILogger<InternalNotifyController> log)
    {
        _notifier = notifier;
        _relay = relay;
        _fcm = fcm;
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
        if(!Bugie.Trips.Api.Security.InternalToken.Matches(token, expected))
        {
            errorResult = Unauthorized(new { error = "Token interno inválido." });
            return false;
        }
        errorResult = null;
        return true;
    }

    /// <summary>
    /// POST /api/internal/notify/driver-location
    /// Un punto GPS de un conductor (compatibilidad). Mismo camino que el lote:
    /// ver DriverLocationRelayService (viaje activo resuelto aquí y cacheado,
    /// SignalR a admin y pasajero en cada punto, desvío de ruta cada N m / N s).
    /// </summary>
    [HttpPost("driver-location")]
    public async Task<IActionResult> NotifyDriverLocation(
        [FromHeader(Name = "X-Internal-Token")] string? token,
        [FromBody] NotifyDriverLocationRequest req,
        CancellationToken ct)
    {
        if(!ValidateInternalToken(token, out var err)) return err!;

        await _relay.RelayAsync(new[]
        {
            new DriverLocationPoint(req.UserId, req.Lat, req.Lng, req.HasActiveTrip, req.SpeedKmh, req.Heading),
        }, ct);
        return Ok();
    }

    /// <summary>
    /// POST /api/internal/notify/driver-locations
    /// Varios puntos GPS (de uno o varios conductores) en una sola llamada. Lo
    /// manda el LocationWriterService de Drivers.Api con cada lote que escribe.
    /// Body: { points: [ { userId, lat, lng, hasActiveTrip, speedKmh?, heading?, at? } ] }.
    /// Se procesan en el orden recibido. Responde 200 { relayed }.
    /// </summary>
    [HttpPost("driver-locations")]
    public async Task<IActionResult> NotifyDriverLocations(
        [FromHeader(Name = "X-Internal-Token")] string? token,
        [FromBody] NotifyDriverLocationsRequest req,
        CancellationToken ct)
    {
        if(!ValidateInternalToken(token, out var err)) return err!;
        var points = req.Points ?? new List<NotifyDriverLocationRequest>();
        if(points.Count == 0) return Ok(new { relayed = 0 });

        await _relay.RelayAsync(points
            .Select(p => new DriverLocationPoint(p.UserId, p.Lat, p.Lng, p.HasActiveTrip, p.SpeedKmh, p.Heading))
            .ToList(), ct);
        return Ok(new { relayed = points.Count });
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

    /// <summary>
    /// POST /api/internal/notify/push
    /// Envía un push FCM a un usuario (todos sus dispositivos). Lo usa Drivers.Api
    /// para avisar al conductor (aprobación, documento rechazado, por vencer...).
    /// Body: { userId, title, body, route?, data? }. Si FCM no está configurado
    /// o el usuario no tiene tokens, responde 200 igual (no es error).
    /// También lo usa Rewards (puntos y pagos de Payments). El FcmSender guarda
    /// el aviso en la bandeja del usuario (trips.usernotifications) aunque no
    /// tenga tokens, y agrega "notification_id" al data del push.
    /// </summary>
    [HttpPost("push")]
    public async Task<IActionResult> SendPush(
        [FromHeader(Name = "X-Internal-Token")] string? token,
        [FromBody] SendPushRequest req,
        CancellationToken ct)
    {
        if(!ValidateInternalToken(token, out var err)) return err!;
        if(req.UserId == Guid.Empty || string.IsNullOrWhiteSpace(req.Title))
            return BadRequest(new { error = "Faltan userId o title." });

        await _fcm.SendToUserAsync(req.UserId,
            new FcmPushMessage(req.Title, req.Body ?? "", req.Route, req.Data), ct);
        return Ok(new { sent = true });
    }
}

/// <summary>GPS del conductor desde Drivers.Api. SpeedKmh, Heading y At (hora del punto) son opcionales.</summary>
public record NotifyDriverLocationRequest(Guid UserId, double Lat, double Lng, bool HasActiveTrip,
                                          double? SpeedKmh = null, double? Heading = null, DateTime? At = null);
/// <summary>Lote de puntos GPS (POST driver-locations).</summary>
public record NotifyDriverLocationsRequest(List<NotifyDriverLocationRequest>? Points);
public record NotifyDriverOfflineRequest(Guid UserId);
public record SendPushRequest(Guid UserId, string Title, string? Body, string? Route,
                              Dictionary<string, string>? Data);
