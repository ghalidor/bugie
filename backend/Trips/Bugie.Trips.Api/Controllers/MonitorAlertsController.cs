using System.Security.Claims;
using System.Text.Json;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Bugie.Security;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Alertas de monitoreo para el admin: sin señal (no_signal), detenido
/// (long_stop) y viaje demorado (trip_delayed). Las detecta
/// MonitorAlertsService cada 30 s; aquí solo se listan y se marcan revisadas.
/// En vivo llegan por SignalR (/hubs/monitor): "monitor:alert" y
/// "monitor:alert-resolved".
/// </summary>
[ApiController]
[Route("api/trips/admin/monitor-alerts")]
[Authorize(Roles = "admin")]
public class MonitorAlertsController : ControllerBase
{
    private const int MaxPageSize = 100;

    private readonly IMonitorAlertRepository _repo;
    public MonitorAlertsController(IMonitorAlertRepository repo) => _repo = repo;

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// GET /api/trips/admin/monitor-alerts?status=open|all&amp;page=1&amp;pageSize=20
    /// status=open (default): sin resolver (revisadas o no). all: todas.
    /// Respuesta: { items: [ { id, tripId, driverId, driverName, passengerName,
    /// type, startedAt, lastSeenAt, resolvedAt, reviewedAt, reviewedByName,
    /// reviewNote, minutes, details } ], total }. Lo más reciente primero.
    /// minutes: minutos de la condición en la última revisión (sin señal,
    /// detenido o duración del viaje). details: último valor medido (JSON).
    /// </summary>
    [HttpGet]
    [RequirePermission(Perm.ViewLiveMap)]
    public async Task<IActionResult> List([FromQuery] string? status = "open",
                                          [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
                                          CancellationToken ct = default)
    {
        var s = string.IsNullOrWhiteSpace(status) ? "open" : status.Trim().ToLowerInvariant();
        if(s is not ("open" or "all"))
            return BadRequest(new { error = "status debe ser 'open' o 'all'." });
        if(page < 1) page = 1;
        if(pageSize < 1) pageSize = 20;
        if(pageSize > MaxPageSize) pageSize = MaxPageSize;

        var (items, total) = await _repo.GetPageAsync(s == "open", page, pageSize, ct);
        return Ok(new
        {
            items = items.Select(a => new
            {
                id = a.Id,
                tripId = a.TripId,
                driverId = a.DriverId,
                driverName = a.DriverName,
                passengerName = a.PassengerName,
                type = a.Type,
                startedAt = a.StartedAt,
                lastSeenAt = a.LastSeenAt,
                resolvedAt = a.ResolvedAt,
                reviewedAt = a.ReviewedAt,
                reviewedByName = a.ReviewedByName,
                reviewNote = a.ReviewNote,
                minutes = a.Minutes,
                details = ParseDetails(a.Details),
            }),
            total,
        });
    }

    /// <summary>
    /// PUT /api/trips/admin/monitor-alerts/{id}/review
    /// Body (opcional): { "note": "Llamé al conductor." }. Marca la alerta
    /// revisada (se conserva la primera revisión). No la cierra: si la
    /// condición sigue, no se abre otra hasta que se resuelva y vuelva a ocurrir.
    /// 204 si existe, 404 si no.
    /// </summary>
    [HttpPut("{id:guid}/review")]
    [RequirePermission(Perm.ViewLiveMap, Perm.ViewSosCenter)]
    public async Task<IActionResult> Review(Guid id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ReviewMonitorAlertRequest? req,
        CancellationToken ct)
    {
        var note = req?.Note?.Trim();
        if(string.IsNullOrEmpty(note)) note = null;
        else if(note.Length > 500) note = note[..500];

        if(!await _repo.ReviewAsync(id, CurrentUserId, note, ct))
            return NotFound(new { error = "Alerta de monitoreo no encontrada." });
        return NoContent();
    }

    private static JsonElement? ParseDetails(string? json)
    {
        if(string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<JsonElement>(json); }
        catch(JsonException) { return null; }
    }
}

public record ReviewMonitorAlertRequest(string? Note);
