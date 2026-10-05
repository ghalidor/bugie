using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Trips.Application.Queries;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoints de Trips usados exclusivamente por el admin.
/// Separado del TripsController principal para evitar inflar ese archivo.
/// </summary>
[ApiController]
[Route("api/trips/admin")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewTrips)]
public class TripsAdminController : ControllerBase {
    private readonly IMediator _mediator;
    public TripsAdminController(IMediator mediator) => _mediator = mediator;

    /// <summary>
    /// GET /api/trips/admin/paged?page=1&amp;pageSize=25&amp;status=1&amp;status=7&amp;search=
    /// Lista paginada con filtros opcionales.
    /// - status: puede repetirse en la URL para múltiples (ej. ?status=1&amp;status=7).
    /// - search: origen o destino, pasajero o conductor (nombre, correo, documento o celular) y placa.
    /// - scheduled: true = solo programados, false = solo "ahora".
    /// - passengerId / driverUserId: viajes de un pasajero o de un conductor (UserId).
    /// - from / to: rango de fechas de creación (yyyy-MM-dd, hora de Perú, ambos incluidos).
    /// </summary>
    [HttpGet("paged")]
    public async Task<IActionResult> Paged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery(Name = "status")] int[]? statuses = null,
        [FromQuery] string? search = null,
        [FromQuery] int? serviceType = null,
        [FromQuery] bool? scheduled = null,
        [FromQuery] Guid? passengerId = null,
        [FromQuery] Guid? driverUserId = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetTripsPagedQuery(page, pageSize, statuses?.ToList(), search, serviceType, scheduled,
                passengerId, driverUserId, from, to), ct));

    /// <summary>
    /// GET /api/trips/admin/stats?status=1&amp;status=7&amp;search=
    /// KPIs respetando los mismos filtros que /paged.
    /// </summary>
    [HttpGet("stats")]
    public async Task<IActionResult> Stats(
        [FromQuery(Name = "status")] int[]? statuses = null,
        [FromQuery] string? search = null,
        [FromQuery] int? serviceType = null,
        [FromQuery] bool? scheduled = null,
        [FromQuery] Guid? passengerId = null,
        [FromQuery] Guid? driverUserId = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetTripsStatsQuery(statuses?.ToList(), search, serviceType, scheduled,
                passengerId, driverUserId, from, to), ct));
}