using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Trips.Application.Queries;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Reportes administrativos. Controller delgado: solo delega a Mediator.
/// La lógica vive en Application/Queries y el acceso a datos en Infrastructure.
/// </summary>
[ApiController]
[Route("api/trips/admin/reports")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewReports)]
public class AdminReportsController : ControllerBase
{
    private readonly IMediator _mediator;
    public AdminReportsController(IMediator mediator) => _mediator = mediator;

    /// <summary>
    /// GET /api/trips/admin/reports/driver-ranking?year=2026&amp;month=5&amp;page=1&amp;pageSize=20
    /// </summary>
    [HttpGet("driver-ranking")]
    public async Task<IActionResult> GetDriverRanking(
        [FromQuery] int year,
        [FromQuery] int month,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        // Validación de input en la frontera (controller). El handler también
        // tiene defensas, pero acá devolvemos 400 con mensaje claro.
        if(year < 2000 || year > 3000) return BadRequest(new { error = "Año inválido." });
        if(month < 1 || month > 12) return BadRequest(new { error = "Mes inválido." });

        var dto = await _mediator.Send(
            new GetDriverRankingQuery(year, month, page, pageSize), ct);
        return Ok(dto);
    }

    /// <summary>
    /// GET /api/trips/admin/reports/driver-ranking/analysis?months=6&amp;top=5&amp;endYear=2026&amp;endMonth=10
    /// Ranking de varios meses (3, 6, 12...): top N por mes y constancia de cada conductor.
    /// Sin endYear/endMonth el rango termina en el mes actual.
    /// </summary>
    [HttpGet("driver-ranking/analysis")]
    public async Task<IActionResult> GetDriverRankingAnalysis(
        [FromQuery] int months = 6,
        [FromQuery] int top = 5,
        [FromQuery] int? endYear = null,
        [FromQuery] int? endMonth = null,
        CancellationToken ct = default)
    {
        if(months < 1 || months > 24) return BadRequest(new { error = "El rango debe ser de 1 a 24 meses." });
        if(top < 1 || top > 20) return BadRequest(new { error = "El top debe ser de 1 a 20." });
        if(endMonth is not null && (endMonth < 1 || endMonth > 12)) return BadRequest(new { error = "Mes inválido." });

        return Ok(await _mediator.Send(
            new GetDriverRankingAnalysisQuery(months, top, endYear, endMonth), ct));
    }
}
