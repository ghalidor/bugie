using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Auditoría de tiempos de respuesta SOS (meta: parámetro sos_response_min). Va aparte de
/// AdminReportsController porque basta con view:reports O view:sos_center
/// (los atributos de controlador y acción se suman).
/// </summary>
[ApiController]
[Route("api/trips/admin/reports")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewReports, Perm.ViewSosCenter)]
public class AdminSosReportController : ControllerBase
{
    private readonly ISosAdminQueries _queries;
    private readonly ILandingClient _landing;

    public AdminSosReportController(ISosAdminQueries queries, ILandingClient landing)
    {
        _queries = queries;
        _landing = landing;
    }

    /// <summary>
    /// GET /api/trips/admin/reports/sos?from=2026-10-01&amp;to=2026-10-31&amp;page=1&amp;pageSize=20
    /// Alertas creadas en el periodo (días de Perú, ambos inclusive; sin fechas: últimos 30 días).
    /// Respuesta: { from, to, goalMin, summary, items, page, pageSize, total }.
    /// goalMin: meta vigente (Configuración → sos_response_min; respaldo 2).
    /// summary: total, resolved, open, responded, pending, avgResponseMin, medianResponseMin,
    /// maxResponseMin, respondedUnder2MinPct, unregisteredCount, avgResolveMin.
    /// items: alertas (la más reciente primero) con visto, atendiendo, resolución,
    /// responseMinutes, durationMinutes (hasta resolver), meetsGoal y attentionUnregistered.
    /// </summary>
    [HttpGet("sos")]
    public async Task<IActionResult> GetSosAudit(
        [FromQuery] string? from = null,
        [FromQuery] string? to = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var period = ReportPeriod.TryCreate(from, to, out var error);
        if(period is null) return BadRequest(new { error });

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var goalMin = await SosResponseGoal.LoadAsync(_landing, ct);
        var data = await _queries.GetAuditAsync(period, goalMin, page, pageSize, ct);
        return Ok(new
        {
            from = period.FromText,
            to = period.ToText,
            goalMin,
            summary = data.Summary,
            items = data.Items,
            page,
            pageSize,
            total = data.Total,
        });
    }
}
