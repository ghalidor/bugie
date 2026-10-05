using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Microsoft.Extensions.Options;
using Bugie.Drivers.Application.Queries;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using Bugie.Drivers.Infrastructure.BackgroundServices;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Endpoints relacionados a la caducidad de documentos.
///   - Conductor: ver sus propios docs próximos a caducar (banner).
///   - Admin: ver TODOS los conductores con docs próximos a caducar.
///
/// El umbral de días viene de appsettings (ExpirationView.UpcomingDays).
/// </summary>
[ApiController]
[Route("api/drivers")]
[Authorize]
public class ExpirationsController : ControllerBase
{
    private readonly IDocumentRepository _docs;
    private readonly IDriverRepository _drivers;
    private readonly IAuthClient _auth;
    private readonly ExpirationViewOptions _opt;
    private readonly IMediator _mediator;

    public ExpirationsController(
        IDocumentRepository docs,
        IDriverRepository drivers,
        IAuthClient auth,
        IOptions<ExpirationViewOptions> opt,
        IMediator mediator)
    {
        _docs = docs;
        _drivers = drivers;
        _auth = auth;
        _opt = opt.Value;
        _mediator = mediator;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// GET /api/drivers/me/upcoming-expirations
    /// Devuelve los docs propios del conductor logueado que caducan dentro de N días
    /// (configurable). Usado por el banner en /app/conductor/inicio.
    /// </summary>
    [HttpGet("me/upcoming-expirations")]
    public async Task<IActionResult> MyUpcoming(CancellationToken ct)
    {
        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        var docs = await _docs.GetExpiringWithinDaysByDriverAsync(driver.Id, _opt.UpcomingDays, ct);

        return Ok(new
        {
            thresholdDays = _opt.UpcomingDays,
            documents = docs.Select(d => new {
                documentId = d.DocumentId,
                docType = d.DocType,
                expiresAt = d.ExpiresAt,
                daysUntilExpiry = d.DaysUntilExpiry,
            }),
        });
    }

    /// <summary>
    /// GET /api/drivers/expiring-soon
    /// Devuelve todos los conductores con al menos un doc próximo a caducar (admin).
    /// </summary>
    [HttpGet("expiring-soon")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewDrivers)]
    public async Task<IActionResult> AdminExpiringSoon([FromQuery] int? days, CancellationToken ct)
    {
        var threshold = days ?? _opt.UpcomingDays;
        var docs = await _docs.GetExpiringWithinDaysAsync(threshold, ct);

        if(docs.Count == 0)
            return Ok(new { thresholdDays = threshold, drivers = Array.Empty<object>() });

        // Agrupar por conductor para devolver una fila por conductor con sus docs
        var byDriver = docs.GroupBy(d => d.DriverUserId).ToList();
        var userIds = byDriver.Select(g => g.Key).ToList();
        var userMap = await _auth.GetUsersByIdsAsync(userIds, ct);

        var result = byDriver.Select(g =>
        {
            userMap.TryGetValue(g.Key, out var user);
            var driverId = g.First().DriverId;
            return new
            {
                driverId,
                userId = g.Key,
                fullName = user?.FullName ?? "—",
                email = user?.Email ?? "—",
                phone = user?.Phone ?? "—",
                documents = g.Select(d => new {
                    documentId = d.DocumentId,
                    docType = d.DocType,
                    expiresAt = d.ExpiresAt,
                    daysUntilExpiry = d.DaysUntilExpiry,
                }).OrderBy(d => d.daysUntilExpiry).ToList(),
            };
        }).OrderBy(r => r.documents.Min(d => d.daysUntilExpiry)).ToList();

        return Ok(new
        {
            thresholdDays = threshold,
            drivers = result,
        });
    }
}

/// <summary>
/// Configuración para vistas de caducidad. En appsettings.json:
///   "ExpirationView": { "UpcomingDays": 15 }
/// </summary>
public class ExpirationViewOptions
{
    public int UpcomingDays { get; set; } = 15;
}