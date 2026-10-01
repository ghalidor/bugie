using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Application.Queries;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoint del historial enriquecido (incluye datos del conductor y vehículo).
/// Separado del TripsController principal para no inflar ese archivo.
/// </summary>
[ApiController]
[Route("api/trips")]
[Authorize]
public class TripHistoryController : ControllerBase
{
    private readonly IMediator _mediator;
    public TripHistoryController(IMediator mediator) => _mediator = mediator;

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role) ?? "passenger";

    /// <summary>
    /// GET /api/trips/history/enriched
    /// Devuelve los viajes del usuario con datos del conductor y vehículo embebidos.
    /// Usado por la nueva pantalla de historial del pasajero.
    /// </summary>
    [HttpGet("history/enriched")]
    public async Task<IActionResult> GetEnrichedHistory(CancellationToken ct) =>
        Ok(await _mediator.Send(
            new GetEnrichedTripHistoryQuery(CurrentUserId, CurrentUserRole), ct));
}