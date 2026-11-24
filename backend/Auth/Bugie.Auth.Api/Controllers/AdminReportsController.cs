using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Auth.Application.Queries;
using Bugie.Auth.Domain.Common;

namespace Bugie.Auth.Api.Controllers;

/// <summary>Reportes administrativos de usuarios. Solo delega a Mediator.</summary>
[ApiController]
[Route("api/auth/admin/reports")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewReports)]
public class AdminReportsController : ControllerBase
{
    private readonly IMediator _mediator;
    public AdminReportsController(IMediator mediator) => _mediator = mediator;

    /// <summary>
    /// GET /api/auth/admin/reports/users?from=2026-09-01&amp;to=2026-09-30
    /// Registros de pasajeros y conductores del periodo (dias de Peru, ambos inclusive).
    /// Sin fechas: ultimos 30 dias hasta hoy.
    /// </summary>
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(
        [FromQuery] string? from = null,
        [FromQuery] string? to = null,
        CancellationToken ct = default)
    {
        var period = ReportPeriod.TryCreate(from, to, out var error);
        if (period is null) return BadRequest(new { error });

        return Ok(await _mediator.Send(new GetUsersReportQuery(period), ct));
    }
}
