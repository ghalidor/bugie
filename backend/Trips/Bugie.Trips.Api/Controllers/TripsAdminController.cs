using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Application.Queries;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoints de Trips usados exclusivamente por el admin.
/// Separado del TripsController principal para evitar inflar ese archivo.
/// </summary>
[ApiController]
[Route("api/trips/admin")]
[Authorize(Roles = "admin")]
public class TripsAdminController : ControllerBase {
    private readonly IMediator _mediator;
    public TripsAdminController(IMediator mediator) => _mediator = mediator;

    /// <summary>
    /// GET /api/trips/admin/all
    /// Devuelve TODOS los viajes ordenados del más reciente al más antiguo.
    /// </summary>
    [HttpGet("all")]
    public async Task<IActionResult> All(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetAllTripsQuery(), ct));

    /// <summary>
    /// GET /api/trips/admin/paged?page=1&amp;pageSize=25&amp;status=1&amp;status=7&amp;search=
    /// Lista paginada con filtros opcionales.
    /// - status: puede repetirse en la URL para múltiples (ej. ?status=1&amp;status=7).
    /// - search: matchea origen o destino.
    /// </summary>
    [HttpGet("paged")]
    public async Task<IActionResult> Paged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery(Name = "status")] int[]? statuses = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetTripsPagedQuery(page, pageSize, statuses?.ToList(), search), ct));

    /// <summary>
    /// GET /api/trips/admin/stats?status=1&amp;status=7&amp;search=
    /// KPIs respetando los mismos filtros que /paged.
    /// </summary>
    [HttpGet("stats")]
    public async Task<IActionResult> Stats(
        [FromQuery(Name = "status")] int[]? statuses = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetTripsStatsQuery(statuses?.ToList(), search), ct));
}