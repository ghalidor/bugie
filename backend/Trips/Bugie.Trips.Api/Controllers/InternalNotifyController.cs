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
    private readonly ITripRealtimeNotifier _realtime;
    private readonly ITripRepository _trips;
    private readonly RouteDeviationService _deviations;
    private readonly IFcmSender _fcm;
    private readonly IConfiguration _cfg;
    private readonly ILogger<InternalNotifyController> _log;

    public InternalNotifyController(IAdminNotifier notifier,
                                     ITripRealtimeNotifier realtime,
                                     ITripRepository trips,
                                     RouteDeviationService deviations,
                                     IFcmSender fcm,
                                     IConfiguration cfg,
                                     ILogger<InternalNotifyController> log)
    {
        _notifier = notifier;
        _realtime = realtime;
        _trips = trips;
        _deviations = deviations;
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
    /// Llamado por Drivers.Api cada vez que un conductor reporta GPS.
    /// </summary>
    [HttpPost("driver-location")]
    public async Task<IActionResult> NotifyDriverLocation(
        [FromHeader(Name = "X-Internal-Token")] string? token,
        [FromBody] NotifyDriverLocationRequest req,
        CancellationToken ct)
    {
        if(!ValidateInternalToken(token, out var err)) return err!;

        // Viaje activo del conductor. Se resuelve aquí por el conductor; no se
        // confía en un tripId que venga del cliente (evita inyectar posiciones
        // en otro viaje). Sirve para el pasajero (hub de viajes) y para el
        // monitoreo (recorrido en vivo por viaje).
        Guid? tripId = null;
        if(req.HasActiveTrip)
        {
            try
            {
                var trip = await _trips.GetActiveTripAsync(req.UserId, ct);
                if(trip is not null && trip.DriverId == req.UserId) tripId = trip.Id;
            }
            catch(Exception ex)
            {
                _log.LogWarning(ex, "No se pudo resolver el viaje activo del conductor {UserId}.", req.UserId);
            }
        }

        // Admins (grupo "admins" de /hubs/monitor): "driver:location" con tripId.
        // Awaitamos para que cualquier error se loguee.
        await _notifier.NotifyDriverLocationAsync(
            req.UserId, req.Lat, req.Lng, req.HasActiveTrip, tripId, req.Heading, req.SpeedKmh, ct);

        // Pasajero del viaje (grupo trip:{id} de /hubs/trips): "DriverLocation".
        if(tripId is not null)
        {
            try
            {
                await _realtime.DriverLocationAsync(tripId.Value, req.Lat, req.Lng, req.Heading, req.SpeedKmh, ct);
            }
            catch(Exception ex)
            {
                _log.LogWarning(ex, "No se pudo emitir DriverLocation del conductor {UserId}.", req.UserId);
            }
        }

        // Detección de desvío de ruta (ver RouteDeviationService). Va después
        // del broadcast y con CancellationToken.None: Drivers corta a los 3s,
        // pero queremos que el cálculo termine igual. Un error aquí no debe
        // afectar al GPS.
        try
        {
            await _deviations.ProcessDriverLocationAsync(
                req.UserId, req.Lat, req.Lng, req.HasActiveTrip, CancellationToken.None);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "Error al revisar desvío de ruta del conductor {UserId}.", req.UserId);
        }
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

/// <summary>GPS del conductor desde Drivers.Api. SpeedKmh y Heading son opcionales (solo para el pasajero).</summary>
public record NotifyDriverLocationRequest(Guid UserId, double Lat, double Lng, bool HasActiveTrip,
                                          double? SpeedKmh = null, double? Heading = null);
public record NotifyDriverOfflineRequest(Guid UserId);
public record SendPushRequest(Guid UserId, string Title, string? Body, string? Route,
                              Dictionary<string, string>? Data);
