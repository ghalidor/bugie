using System.Text.Json;
using Bugie.Trips.Api.Realtime;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Avisos para el Centro de avisos del panel admin.
///
/// Otros servicios (Landing, Drivers, Auth) llaman a este endpoint cuando
/// pasa algo que el admin debe saber (mensaje de contacto nuevo, reclamación,
/// conductor que envía documentos, pasajero que sube su DNI...). Trips lo
/// reenvía por SignalR al grupo "admins" como evento "admin:event" con el
/// mismo payload + createdAt + notificationId (id en el historial
/// trips.adminnotifications; null si no se pudo guardar).
///
/// POST /api/internal/admin-events
/// Header: X-Internal-Token (appsettings: InternalToken). No usa JWT.
/// Body:   { type, title, message, link, permission }
///
/// El panel decide si lo muestra según el permiso del admin (permission) y
/// la configuración de avisos (Sistema > Avisos).
/// </summary>
[ApiController]
[Route("api/internal/admin-events")]
[AllowAnonymous] // Lo protege el token interno, no el JWT.
public class InternalAdminEventsController : ControllerBase
{
    /// <summary>Tipos de aviso aceptados (contrato compartido con el panel).</summary>
    public static readonly HashSet<string> AllowedTypes = new(StringComparer.Ordinal)
    {
        "deviation", "contact_message", "complaint",
        "driver_review", "passenger_review", "document_expiring",
    };

    private readonly IHubContext<MonitorHub> _hub;
    private readonly IAdminNotificationRepository _history;
    private readonly IConfiguration _cfg;
    private readonly ILogger<InternalAdminEventsController> _log;

    public InternalAdminEventsController(IHubContext<MonitorHub> hub, IAdminNotificationRepository history,
                                         IConfiguration cfg, ILogger<InternalAdminEventsController> log)
    {
        _hub = hub;
        _history = history;
        _cfg = cfg;
        _log = log;
    }

    [HttpPost]
    public async Task<IActionResult> Publish(
        [FromHeader(Name = "X-Internal-Token")] string? token,
        [FromBody] AdminEventRequest req,
        CancellationToken ct)
    {
        var expected = _cfg["InternalToken"];
        if(string.IsNullOrEmpty(expected))
        {
            _log.LogError("InternalToken no configurado en appsettings.");
            return StatusCode(500, new { error = "Configuración interna inválida." });
        }
        if(!Bugie.Trips.Api.Security.InternalToken.Matches(token, expected))
            return Unauthorized(new { error = "Token interno inválido." });

        if(req is null || string.IsNullOrWhiteSpace(req.Type) || !AllowedTypes.Contains(req.Type))
            return BadRequest(new { error = "Tipo de aviso no válido." });
        if(string.IsNullOrWhiteSpace(req.Title))
            return BadRequest(new { error = "El título es obligatorio." });

        // Historial (trips.adminnotifications). Si falla, el aviso igual se envía.
        Guid? notificationId = null;
        try
        {
            var dataJson = req.Data is { ValueKind: JsonValueKind.Object } d ? d.GetRawText() : null;
            notificationId = await _history.AddAsync(req.Type, req.Title, req.Message, req.Link,
                                                     req.Permission, dataJson, ct);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo guardar el aviso '{Type}' en el historial.", req.Type);
        }

        try
        {
            await _hub.Clients.Group("admins").SendAsync("admin:event", new
            {
                notificationId,
                type = req.Type,
                title = req.Title,
                message = req.Message ?? string.Empty,
                link = req.Link ?? string.Empty,
                permission = req.Permission ?? string.Empty,
                createdAt = DateTime.UtcNow,
            }, ct);
            _log.LogInformation("SignalR: 'admin:event' ({Type}) empujado.", req.Type);
        }
        catch(Exception ex)
        {
            // No crítico: el panel igual muestra los recordatorios periódicos.
            _log.LogWarning(ex, "No se pudo enviar 'admin:event' por SignalR.");
        }
        return Ok(new { sent = true, notificationId });
    }
}

/// <summary>Data (opcional): objeto JSON con datos extra; se guarda en el historial.</summary>
public record AdminEventRequest(string Type, string Title, string? Message, string? Link, string? Permission,
                                JsonElement? Data = null);
