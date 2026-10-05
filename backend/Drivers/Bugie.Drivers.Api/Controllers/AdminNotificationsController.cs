using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Conteos de conductores para los recordatorios del Centro de avisos del
/// panel admin. Lo consume Trips (GET /api/trips/admin/notifications/summary).
///
/// GET /api/drivers/admin/notifications/summary
///   expiringDrivers: conductores aprobados con algún documento que vence
///                    dentro del umbral mayor de doc_expiry_alert_days
///                    (incluye los ya vencidos).
///   thresholdDays:   umbrales configurados (ej. [6, 3, 0]).
///   driversToReview: conductores que enviaron sus documentos a revisión.
/// </summary>
[ApiController]
[Route("api/drivers/admin/notifications")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewDrivers, Perm.ViewVerification)]
public class AdminNotificationsController : ControllerBase
{
    private readonly IDocumentRepository _docs;
    private readonly IDriverRepository _drivers;
    private readonly ILandingSettingsClient _settings;

    public AdminNotificationsController(IDocumentRepository docs, IDriverRepository drivers,
                                        ILandingSettingsClient settings)
    {
        _docs = docs;
        _drivers = drivers;
        _settings = settings;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct)
    {
        var thresholds = DocExpiryAlertDays.Parse(
            await _settings.GetSettingAsync(DocExpiryAlertDays.SettingKey, ct));

        var docs = await _docs.GetExpiringWithinDaysAsync(thresholds.Max(), ct);
        var expiringDrivers = docs.Select(d => d.DriverId).Distinct().Count();

        var stats = await _drivers.GetStatsAsync(null, null, null, null, ct);

        return Ok(new
        {
            expiringDrivers,
            thresholdDays = thresholds,
            driversToReview = stats.UnderReview,
            // Conductores rechazados/suspendidos con solicitud de revisión abierta
            openReviewRequests = stats.OpenReviewRequests,
        });
    }
}
