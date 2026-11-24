using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Drivers.Application.Queries;
using Bugie.Drivers.Domain.Common;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>Reportes administrativos de conductores. Solo delega a Mediator.</summary>
[ApiController]
[Route("api/drivers/admin/reports")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewReports)]
public class AdminReportsController : ControllerBase
{
    private readonly IMediator _mediator;
    public AdminReportsController(IMediator mediator) => _mediator = mediator;

    /// <summary>
    /// GET /api/drivers/admin/reports/summary?from=2026-09-01&amp;to=2026-09-30
    /// Resumen de conductores del periodo (dias de Peru, ambos inclusive).
    /// Sin fechas: ultimos 30 dias hasta hoy.
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(
        [FromQuery] string? from = null,
        [FromQuery] string? to = null,
        CancellationToken ct = default)
    {
        var period = ReportPeriod.TryCreate(from, to, out var error);
        if (period is null) return BadRequest(new { error });

        return Ok(await _mediator.Send(new GetDriversReportQuery(period), ct));
    }
}
