using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using Bugie.Trips.Api.Realtime;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Historial de avisos EN VIVO del panel admin (Centro de avisos).
/// Se guarda una fila por cada "admin:event" (POST api/internal/admin-events)
/// y por cada desvio de ruta nuevo ("deviation:new"). El payload SignalR
/// lleva notificationId para marcarlo leido desde el emergente.
/// Los recordatorios PERIODICOS (summary) los arma el panel: no estan aqui.
///
/// Cada admin ve solo los avisos de sus permisos (los pide a Auth); un aviso
/// sin permiso lo ven todos y super_admin ve todo. La lectura es por admin.
/// Fechas en hora de Peru.
///
///   GET  /api/trips/admin/notifications/history?page=1&amp;pageSize=20&amp;type=&amp;from=yyyy-MM-dd&amp;to=yyyy-MM-dd&amp;unreadOnly=false
///   GET  /api/trips/admin/notifications/history/unread-count
///   POST /api/trips/admin/notifications/history/{id}/read
///   POST /api/trips/admin/notifications/history/read-all
/// </summary>
[ApiController]
[Route("api/trips/admin/notifications/history")]
[Authorize(Roles = "admin")]
public class AdminNotificationHistoryController : ControllerBase
{
    private const int MaxPageSize = 100;
    private readonly IAdminNotificationRepository _repo;
    private readonly AdminPermissionsClient _perms;

    public AdminNotificationHistoryController(IAdminNotificationRepository repo, AdminPermissionsClient perms)
    {
        _repo = repo;
        _perms = perms;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// Historial, lo mas reciente primero. from/to son dias de Peru (ambos
    /// inclusive). total respeta los filtros; unread es el total de no leidos
    /// del admin (sin filtros, para el globo de la campana). pageSize maximo 100.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetHistory(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] string? type = null, [FromQuery] string? from = null, [FromQuery] string? to = null,
        [FromQuery] bool unreadOnly = false, CancellationToken ct = default)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 20;
        if (pageSize > MaxPageSize) pageSize = MaxPageSize;

        if (!TryParseDay(from, out var fromDay) || !TryParseDay(to, out var toDay))
            return BadRequest(new { error = "Fecha invalida. Usa el formato yyyy-MM-dd." });
        if (fromDay.HasValue && toDay.HasValue && fromDay > toDay)
            return BadRequest(new { error = "La fecha 'desde' no puede ser mayor que 'hasta'." });

        // Dia de Peru -> rango UTC [desde 00:00, hasta+1 00:00).
        DateTime? fromUtc = fromDay.HasValue ? BugieTime.PeruToUtc(fromDay.Value) : null;
        DateTime? toUtc   = toDay.HasValue ? BugieTime.PeruToUtc(toDay.Value.AddDays(1)) : null;

        var perms = await _perms.GetAsync(Request, ct);
        var (items, total, unread) = await _repo.GetPageAsync(
            CurrentUserId, perms, type, fromUtc, toUtc, unreadOnly, page, pageSize, ct);

        return Ok(new
        {
            items = items.Select(n => new
            {
                id        = n.Id,
                type      = n.Type,
                title     = n.Title,
                message   = n.Message,
                link      = n.Link,
                data      = ParseData(n.Data),
                createdAt = n.CreatedAt,
                read      = n.ReadAt.HasValue,
                readAt    = n.ReadAt,
            }),
            total,
            page,
            pageSize,
            unread,
        });
    }

    /// <summary>No leidos del admin actual (globo de la campana).</summary>
    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount(CancellationToken ct)
    {
        var perms = await _perms.GetAsync(Request, ct);
        return Ok(new { unread = await _repo.CountUnreadAsync(CurrentUserId, perms, ct) });
    }

    /// <summary>Marca un aviso como leido. 404 si no existe o el admin no lo puede ver.</summary>
    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct)
    {
        var perms = await _perms.GetAsync(Request, ct);
        return await _repo.MarkReadAsync(id, CurrentUserId, perms, ct)
            ? NoContent()
            : NotFound(new { error = "Aviso no encontrado." });
    }

    /// <summary>Marca como leidos todos los avisos que el admin puede ver.</summary>
    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
    {
        var perms = await _perms.GetAsync(Request, ct);
        return Ok(new { updated = await _repo.MarkAllReadAsync(CurrentUserId, perms, ct) });
    }

    private static bool TryParseDay(string? s, out DateTime? day)
    {
        day = null;
        if (string.IsNullOrWhiteSpace(s)) return true;
        if (!DateTime.TryParseExact(s.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture,
                                    DateTimeStyles.None, out var d)) return false;
        day = d.Date;
        return true;
    }

    /// <summary>La columna Data es JSON; se devuelve como objeto (null si no hay).</summary>
    private static JsonElement? ParseData(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.Clone();
        }
        catch { return null; }
    }
}
