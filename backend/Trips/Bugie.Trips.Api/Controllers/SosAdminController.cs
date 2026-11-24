using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Centro SOS del admin: alertas activas con nombre y celular de quien activó y
/// del otro participante, e historial de alertas resueltas (quién resolvió,
/// motivo y duración). Resolver sigue en PUT /api/sos/{alertId}/resolve.
/// Atención: "visto" (PUT {id}/seen) y "atendiendo" (PUT {id}/attending), solo
/// la primera vez; los demás admins lo ven al instante por SignalR ("sos:updated").
/// </summary>
[ApiController]
[Route("api/sos/admin")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewSosCenter, Perm.ViewLiveMap)]
public class SosAdminController : ControllerBase
{
    private readonly ISosAdminQueries _queries;
    private readonly IAdminNotifier _notifier;

    public SosAdminController(ISosAdminQueries queries, IAdminNotifier notifier)
    {
        _queries = queries;
        _notifier = notifier;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>GET /api/sos/admin/active → alertas activas con los datos de las personas.</summary>
    [HttpGet("active")]
    public async Task<IActionResult> Active(CancellationToken ct) =>
        Ok(await _queries.GetActiveAsync(ct));

    /// <summary>
    /// GET /api/sos/admin/history?page=1&amp;pageSize=20&amp;from=2026-10-01&amp;to=2026-10-31&amp;search=
    /// Alertas resueltas, la más reciente primero. from / to: días de Perú (ambos incluidos).
    /// </summary>
    [HttpGet("history")]
    public async Task<IActionResult> History(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var (items, total) = await _queries.GetHistoryAsync(page, pageSize,
            from is null ? null : BugieTime.PeruToUtc(from.Value.Date),
            to   is null ? null : BugieTime.PeruToUtc(to.Value.Date.AddDays(1)),
            search, ct);
        return Ok(new { items, page = Math.Max(1, page), pageSize = Math.Clamp(pageSize, 1, 100), total });
    }

    /// <summary>
    /// PUT /api/sos/admin/{id}/seen → "visto": el admin abrió la alerta (detalle en
    /// el Centro SOS o su viaje en Monitoreo). Solo cuenta la primera vez; si ya
    /// estaba vista o resuelta no cambia nada. Devuelve la alerta con sus marcas.
    /// </summary>
    [HttpPut("{id:guid}/seen")]
    public async Task<IActionResult> Seen(Guid id, CancellationToken ct)
    {
        var changed = await _queries.MarkSeenAsync(id, CurrentUserId, ct);
        var alert = await _queries.GetByIdAsync(id, ct);
        if(alert is null) return NotFound(new { error = "Alerta no encontrada." });
        if(changed > 0) await _notifier.NotifySosAttentionAsync(alert, "seen", ct);
        return Ok(alert);
    }

    /// <summary>
    /// PUT /api/sos/admin/{id}/attending → "atendiendo": el admin toma la alerta.
    /// Solo la primera vez; repetirlo el mismo admin devuelve 200. Si ya la tomó
    /// otro admin: 409 { error, attendingBy, attendingByName, attendingAt }.
    /// Resuelta sin haberla tomado nadie: 409. No reemplaza a resolver.
    /// </summary>
    [HttpPut("{id:guid}/attending")]
    public async Task<IActionResult> Attending(Guid id, CancellationToken ct)
    {
        var me = CurrentUserId;
        var changed = await _queries.MarkAttendingAsync(id, me, ct);
        var alert = await _queries.GetByIdAsync(id, ct);
        if(alert is null) return NotFound(new { error = "Alerta no encontrada." });

        if(alert.AttendingBy == me)
        {
            if(changed > 0) await _notifier.NotifySosAttentionAsync(alert, "attending", ct);
            return Ok(alert);
        }
        if(alert.AttendingAt is null)
            return Conflict(new { error = "La alerta ya está resuelta." });

        var who = string.IsNullOrWhiteSpace(alert.AttendingByName) ? "otro administrador" : alert.AttendingByName;
        return Conflict(new
        {
            error = $"Esta alerta ya la está atendiendo {who}.",
            attendingBy = alert.AttendingBy,
            attendingByName = alert.AttendingByName,
            attendingAt = alert.AttendingAt,
        });
    }
}
