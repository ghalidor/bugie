using System.Text.Json;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Soporte: el admin ve la bandeja de notificaciones de un usuario
/// (pasajero o conductor) tal como la ve el usuario. Solo lectura: no marca
/// nada como leido. Misma forma que GET /api/trips/notifications/me.
///
///   GET /api/trips/admin/users/{userId}/notifications?page=1&amp;pageSize=20
/// </summary>
[ApiController]
[Route("api/trips/admin/users/{userId:guid}/notifications")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewUsers, Perm.ViewPassengers, Perm.ViewDrivers)]
public class AdminUserNotificationsController : ControllerBase
{
    private const int MaxPageSize = 50;
    private readonly IUserNotificationRepository _repo;

    public AdminUserNotificationsController(IUserNotificationRepository repo) => _repo = repo;

    [HttpGet]
    public async Task<IActionResult> Get(Guid userId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 20;
        if (pageSize > MaxPageSize) pageSize = MaxPageSize;

        var (items, total, unread) = await _repo.GetPageAsync(userId, page, pageSize, ct);

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

    /// <summary>La columna Data es un JSON {"clave":"valor"}; se devuelve como objeto.</summary>
    private static Dictionary<string, string>? ParseData(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try { return JsonSerializer.Deserialize<Dictionary<string, string>>(json); }
        catch { return null; }
    }
}
