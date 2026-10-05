using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Api.Controllers;

/// <summary>
/// Conteos del sitio web para los recordatorios del Centro de avisos del
/// panel admin. Lo consume Trips (GET /api/trips/admin/notifications/summary).
///
/// GET /api/landing/admin/notifications/summary
///   unattendedMessages: mensajes de contacto todavía sin respuesta.
/// (Las reclamaciones van aparte: GET /api/landing/admin/complaints/summary.)
/// </summary>
[ApiController]
[Route("api/landing/admin/notifications")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewMessages)]
public class AdminNotificationsController : ControllerBase
{
    private readonly IContactRepository _contacts;

    public AdminNotificationsController(IContactRepository contacts) => _contacts = contacts;

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct) =>
        Ok(new { unattendedMessages = await _contacts.CountUnattendedAsync(ct) });
}
