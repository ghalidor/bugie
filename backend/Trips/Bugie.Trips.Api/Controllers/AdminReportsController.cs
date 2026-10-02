using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Application.Queries;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Reportes administrativos. Controller delgado: solo delega a Mediator.
/// La lógica vive en Application/Queries y el acceso a datos en Infrastructure.
/// </summary>
[ApiController]
[Route("api/trips/admin/reports")]
[Authorize(Roles = "admin")]
public class AdminReportsController : ControllerBase
{
    private readonly IMediator _mediator;
    public AdminReportsController(IMediator mediator) => _mediator = mediator;

    /// <summary>
    /// GET /api/trips/admin/reports/driver-ranking?year=2026&month=5&page=1&pageSize=20
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
}
