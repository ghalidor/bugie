using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Bandeja de notificaciones del usuario actual (pasajero o conductor).
/// Cada push visible que se le envia queda guardado (ver FcmSender), aunque
/// no tenga tokens FCM. Fechas en hora de Peru. No se borra nada.
///
///   GET  /api/trips/notifications/me?page=1&amp;pageSize=20
///   GET  /api/trips/notifications/me/unread-count
///   POST /api/trips/notifications/{id}/read
///   POST /api/trips/notifications/me/read-all
/// </summary>
[ApiController]
[Route("api/trips/notifications")]
[Authorize]
public class UserNotificationsController : ControllerBase
{
    private const int MaxPageSize = 50;
    private readonly IUserNotificationRepository _repo;

    public UserNotificationsController(IUserNotificationRepository repo) => _repo = repo;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>Avisos del usuario, lo mas reciente primero. pageSize maximo 50.</summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMine(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 20;
        if (pageSize > MaxPageSize) pageSize = MaxPageSize;

        var (items, total, unread) = await _repo.GetPageAsync(CurrentUserId, page, pageSize, ct);

        return Ok(new
        {
            items = items.Select(n => new
            {
                id        = n.Id,
                title     = n.Title,
                body      = n.Body,
                type      = n.Type,
                alertType = n.AlertType,
                route     = n.Route,
                data      = ParseData(n.Data),
                createdAt = n.CreatedAt,
                readAt    = n.ReadAt,
                read      = n.ReadAt.HasValue,
            }),
            total,
            page,
            pageSize,
            unread,
        });
    }

    /// <summary>Numero de avisos sin leer (para el globo de la campana).</summary>
    [HttpGet("me/unread-count")]
    public async Task<IActionResult> UnreadCount(CancellationToken ct) =>
        Ok(new { unread = await _repo.CountUnreadAsync(CurrentUserId, ct) });

    /// <summary>Marca un aviso como leido. 404 si no existe o es de otro usuario.</summary>
    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct) =>
        await _repo.MarkReadAsync(id, CurrentUserId, ct)
            ? NoContent()
            : NotFound(new { error = "Notificacion no encontrada." });

    /// <summary>Marca todos los avisos del usuario como leidos.</summary>
    [HttpPost("me/read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct) =>
        Ok(new { updated = await _repo.MarkAllReadAsync(CurrentUserId, ct) });

    /// <summary>La columna Data es un JSON {"clave":"valor"}; se devuelve como objeto.</summary>
    private static Dictionary<string, string>? ParseData(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<Dictionary<string, string>>(json); }
        catch { return null; }
    }
}
