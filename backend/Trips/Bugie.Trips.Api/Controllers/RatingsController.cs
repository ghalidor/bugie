using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Application.Queries;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoints de calificaciones de viajes (pasajero → conductor).
/// El pasajero califica un viaje completado con 1-5 estrellas + comentario opcional.
/// El conductor (y el admin) pueden ver el historial de calificaciones recibidas.
/// </summary>
[ApiController]
[Route("api/trips/ratings")]
[Authorize]
public class RatingsController : ControllerBase
{
    private readonly IMediator _mediator;
    public RatingsController(IMediator mediator) => _mediator = mediator;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// POST /api/trips/ratings/{tripId}
    /// El pasajero califica un viaje completado. Body: { stars: 1-5, comment?: string }
    /// </summary>
    [HttpPost("{tripId:guid}")]
    public async Task<IActionResult> Create(
        Guid tripId, [FromBody] CreateRatingRequest body, CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(new CreateRatingCommand(
                tripId, CurrentUserId, body.Stars, body.Comment), ct);
            return Ok(dto);
        }
        catch(ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch(KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch(UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    /// <summary>
    /// GET /api/trips/ratings/me/by-trips?ids=...&ids=...
    /// Versión batch: devuelve Map {tripId → rating} para todos los viajes dados.
    /// Los viajes sin calificación NO aparecen en el resultado.
    /// Usado por el historial del pasajero para evitar N llamadas paralelas.
    /// </summary>
    [HttpGet("me/by-trips")]
    public async Task<IActionResult> GetByTrips(
        [FromQuery(Name = "ids")] List<Guid> ids,
        CancellationToken ct)
    {
        if(ids is null || ids.Count == 0)
            return Ok(new Dictionary<Guid, TripRatingDto>());

        // Hard limit para evitar abusos: máx 200 ids por request.
        if(ids.Count > 200)
            return BadRequest(new { error = "Demasiados ids (máx 200)." });

        var dto = await _mediator.Send(new GetTripRatingsBatchQuery(ids), ct);
        return Ok(dto);
    }

    /// <summary>
    /// GET /api/trips/ratings/trip/{tripId}
    /// Devuelve la calificación de un viaje (o 204 NoContent si no fue calificado).
    /// El frontend del pasajero lo usa para saber si mostrar "Calificar" o "Ya calificaste".
    /// </summary>
    [HttpGet("trip/{tripId:guid}")]
    public async Task<IActionResult> GetByTrip(Guid tripId, CancellationToken ct)
    {
        var dto = await _mediator.Send(new GetTripRatingQuery(tripId), ct);
        if(dto is null) return NoContent();
        return Ok(dto);
    }

    /// <summary>
    /// GET /api/trips/ratings/driver/{driverUserId}?page=1&pageSize=10
    /// Lista paginada de calificaciones recibidas por un conductor.
    /// - El conductor mismo lo usa para su historial.
    /// - El admin lo usa en DriverDetail.
    /// No exigimos que sea el dueño porque el admin también lo consume; si
    /// querés restringir, agregar un check de rol o de "soy el conductor".
    /// </summary>
    [HttpGet("driver/{driverUserId:guid}")]
    public async Task<IActionResult> GetByDriver(
        Guid driverUserId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        var dto = await _mediator.Send(
            new GetDriverRatingsQuery(driverUserId, page, pageSize), ct);
        return Ok(dto);
    }

    /// <summary>
    /// Atajo: GET /api/trips/ratings/me?page=1&pageSize=10
    /// El conductor logueado ve sus propias calificaciones recibidas.
    /// </summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMine(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        var dto = await _mediator.Send(
            new GetDriverRatingsQuery(CurrentUserId, page, pageSize), ct);
        return Ok(dto);
    }
}
