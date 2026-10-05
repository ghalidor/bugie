using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Trips.Application.Queries;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Viajes de UN pasajero o de UN conductor, para la pestaña "Viajes" de su ficha
/// en el admin. Va aparte de TripsAdminController (que exige view:trips) para que
/// quien ve pasajeros o conductores pueda ver los viajes de esa persona.
/// </summary>
[ApiController]
[Route("api/trips/admin")]
[Authorize(Roles = "admin")]
public class TripsAdminByUserController : ControllerBase {
    private readonly IMediator _mediator;
    public TripsAdminByUserController(IMediator mediator) => _mediator = mediator;

    /// <summary>
    /// GET /api/trips/admin/by-passenger/{userId}?page=1&amp;pageSize=10&amp;status=4&amp;from=&amp;to=
    /// Viajes del pasajero (UserId), del más reciente al más antiguo.
    /// </summary>
    [HttpGet("by-passenger/{userId:guid}")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewPassengers)]
    public async Task<IActionResult> ByPassenger(Guid userId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery(Name = "status")] int[]? statuses = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetTripsPagedQuery(page, pageSize, statuses?.ToList(), null,
            PassengerId: userId, From: from, To: to), ct));

    /// <summary>
    /// GET /api/trips/admin/by-driver/{userId}?page=1&amp;pageSize=10&amp;status=4&amp;from=&amp;to=
    /// Viajes del conductor (su UserId, no el Id del perfil de conductor).
    /// </summary>
    [HttpGet("by-driver/{userId:guid}")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewDrivers)]
    public async Task<IActionResult> ByDriver(Guid userId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery(Name = "status")] int[]? statuses = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetTripsPagedQuery(page, pageSize, statuses?.ToList(), null,
            DriverUserId: userId, From: from, To: to), ct));
}
