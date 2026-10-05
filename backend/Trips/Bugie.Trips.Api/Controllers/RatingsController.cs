using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Application.Queries;
using Bugie.Trips.Domain.Interfaces;

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
    private readonly ITripRatingRepository _ratings;
    private readonly ITripRepository _trips;

    public RatingsController(IMediator mediator, ITripRatingRepository ratings, ITripRepository trips)
    {
        _mediator = mediator;
        _ratings = ratings;
        _trips = trips;
    }

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
    /// GET /api/trips/ratings/me/by-trips?ids=...&amp;ids=...
    /// Versión batch: devuelve Map {tripId → rating} para todos los viajes dados.
    /// Los viajes sin calificación NO aparecen en el resultado.
    /// Usado por el historial del pasajero para evitar N llamadas paralelas.
    /// </summary>
    [HttpGet("me/by-trips")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewDrivers, Perm.ViewComplaints, Perm.ViewLiveMap, SkipForNonAdmins = true)]
    public async Task<IActionResult> GetByTrips(
        [FromQuery(Name = "ids")] List<Guid> ids,
        CancellationToken ct)
    {
        if(ids is null || ids.Count == 0)
            return Ok(new Dictionary<Guid, TripRatingDto>());

        // Hard limit para evitar abusos: máx 200 ids por request.
        if(ids.Count > 200)
            return BadRequest(new { error = "Demasiados ids (máx 200)." });

        // Solo calificaciones de viajes del usuario (como pasajero o conductor);
        // el admin ve todas. El conductor ve al pasajero con nombre corto.
        var isAdmin = User.IsInRole("admin");
        var dto = await _mediator.Send(new GetTripRatingsBatchQuery(
            ids, ShortPassengerNames: !isAdmin && User.IsInRole("driver")), ct);
        if(!isAdmin)
            dto = dto.Where(kv => kv.Value.PassengerId == CurrentUserId || kv.Value.DriverId == CurrentUserId)
                     .ToDictionary(kv => kv.Key, kv => kv.Value);
        return Ok(dto);
    }

    /// <summary>
    /// GET /api/trips/ratings/trip/{tripId}
    /// Devuelve la calificación de un viaje (o 204 NoContent si no fue calificado).
    /// El frontend del pasajero lo usa para saber si mostrar "Calificar" o "Ya calificaste".
    /// </summary>
    [HttpGet("trip/{tripId:guid}")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewDrivers, Perm.ViewComplaints, Perm.ViewLiveMap, SkipForNonAdmins = true)]
    public async Task<IActionResult> GetByTrip(Guid tripId, CancellationToken ct)
    {
        // Solo el pasajero o el conductor del viaje, o un admin.
        var isAdmin = User.IsInRole("admin");
        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
        if(!isAdmin && trip.PassengerId != CurrentUserId && trip.DriverId != CurrentUserId)
            return Forbid();

        // El conductor ve al pasajero con nombre corto.
        var shortNames = !isAdmin && trip.PassengerId != CurrentUserId;
        var dto = await _mediator.Send(new GetTripRatingQuery(tripId, shortNames), ct);
        if(dto is null) return NoContent();
        return Ok(dto);
    }

    /// <summary>
    /// GET /api/trips/ratings/driver/{driverUserId}?page=1&amp;pageSize=10
    /// Lista paginada de calificaciones recibidas por un conductor.
    /// - El conductor mismo lo usa para su historial.
    /// - El admin lo usa en DriverDetail.
    /// Solo el admin o el propio conductor (403 para cualquier otro usuario).
    /// El conductor ve a los pasajeros con nombre corto; el admin, completo.
    /// </summary>
    [HttpGet("driver/{driverUserId:guid}")]
    [RequirePermission(Perm.ViewDrivers, Perm.ViewVerification, SkipForNonAdmins = true)]
    public async Task<IActionResult> GetByDriver(
        Guid driverUserId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        var isAdmin = User.IsInRole("admin");
        if(!isAdmin && driverUserId != CurrentUserId) return Forbid();

        var dto = await _mediator.Send(
            new GetDriverRatingsQuery(driverUserId, page, pageSize, ShortPassengerNames: !isAdmin), ct);
        return Ok(dto);
    }

    /// <summary>
    /// GET /api/trips/ratings/me/summary
    /// Resumen de la calificacion RECIBIDA por el usuario logueado ("Mi cuenta").
    /// - Conductor: promedio y cantidad desde trips.TripRatings
    ///   (myRating = null y myRatingCount = 0 si aun no lo calificaron).
    /// - Pasajero (u otro rol): hoy NO existe calificacion conductor -> pasajero,
    ///   asi que myRating y myRatingCount salen null y ratingsAvailable = false.
    /// </summary>
    [HttpGet("me/summary")]
    public async Task<IActionResult> GetMySummary(CancellationToken ct)
    {
        var role = User.FindFirstValue(ClaimTypes.Role) ?? "passenger";
        if(role != "driver")
            return Ok(new MyRatingSummaryDto(role, false, null, null));

        var stats = (await _ratings.GetDriverStatsAsync(new[] { CurrentUserId }, ct))
            .GetValueOrDefault(CurrentUserId);
        return Ok(new MyRatingSummaryDto(role, true, stats?.Average, stats?.Count ?? 0));
    }

    /// <summary>
    /// Atajo: GET /api/trips/ratings/me?page=1&amp;pageSize=10
    /// El conductor logueado ve sus propias calificaciones recibidas.
    /// </summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMine(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        // Nombre corto del pasajero ("Nombre A."), no el completo.
        var dto = await _mediator.Send(
            new GetDriverRatingsQuery(CurrentUserId, page, pageSize, ShortPassengerNames: true), ct);
        return Ok(dto);
    }
}

/// <summary>Respuesta de GET /api/trips/ratings/me/summary.</summary>
public record MyRatingSummaryDto(
    string Role,
    bool RatingsAvailable,
    decimal? MyRating,
    int? MyRatingCount);
