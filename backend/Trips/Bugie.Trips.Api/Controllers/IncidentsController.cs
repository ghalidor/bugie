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

[ApiController]
[Route("api/trips/incidents")]
[Authorize]
public class IncidentsController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly ILogger<IncidentsController> _log;
    private readonly ITripRepository _trips;
    public IncidentsController(IMediator mediator, ILogger<IncidentsController> log, ITripRepository trips)
        => (_mediator, _log, _trips) = (mediator, log, trips);

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role) ?? "passenger";

    /// <summary>
    /// POST /api/trips/incidents/{tripId}
    /// El pasajero o conductor reporta una incidencia sobre un viaje propio.
    /// </summary>
    [HttpPost("{tripId:guid}")]
    public async Task<IActionResult> Create(
        Guid tripId, [FromBody] CreateIncidentRequest body, CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(new CreateIncidentCommand(
                tripId, CurrentUserId, CurrentUserRole, body.Description), ct);
            return Ok(dto);
        }
        catch(ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch(KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch(UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
        catch(Exception ex)
        {
            // Cualquier otra cosa (SQL error, tabla inexistente, claim faltante,
            // null reference, etc.): el detalle va solo al log; al cliente un
            // mensaje generico (no se exponen detalles internos).
            _log.LogError(ex,
                "Error inesperado al crear incidencia. Trip={TripId}, User={UserId}, Role={Role}",
                tripId, CurrentUserId, CurrentUserRole);
            return StatusCode(500, new
            {
                error = "Error interno al crear la incidencia.",
            });
        }
    }

    /// <summary>
    /// GET /api/trips/incidents/{tripId}
    /// Devuelve las incidencias del viaje. Si es admin, ve todas.
    /// Si es pasajero/conductor del viaje, solo ve las que él reportó.
    /// Cualquier otro usuario: 403.
    /// </summary>
    [HttpGet("{tripId:guid}")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewComplaints, Perm.ViewSosCenter, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewPayments, Perm.ViewCommissions, SkipForNonAdmins = true)]
    public async Task<IActionResult> GetByTrip(Guid tripId, CancellationToken ct)
    {
        var isAdmin = User.IsInRole("admin");
        if(!isAdmin)
        {
            var trip = await _trips.GetByIdAsync(tripId, ct);
            if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
            if(trip.PassengerId != CurrentUserId && trip.DriverId != CurrentUserId)
                return Forbid();
        }

        var list = await _mediator.Send(new GetIncidentsByTripQuery(tripId), ct);
        if(!isAdmin)
            list = list.Where(i => i.ReportedByUserId == CurrentUserId).ToList();
        return Ok(list);
    }

    /// <summary>
    /// GET /api/trips/incidents/me/by-trips?ids=guid&amp;ids=guid
    /// Devuelve un map { tripId: incidentForThisRole | null }.
    /// Usado por la pantalla de historial para saber si el botón debe decir
    /// "Reportar incidencia" o "Ver mi incidencia".
    /// </summary>
    [HttpGet("me/by-trips")]
    public async Task<IActionResult> MyIncidentsByTrips(
        [FromQuery] List<Guid> ids, CancellationToken ct)
    {
        if(ids is null || ids.Count == 0)
            return Ok(new Dictionary<Guid, IncidentDto?>());

        var result = new Dictionary<Guid, IncidentDto?>();
        foreach(var tripId in ids.Distinct())
        {
            // Esta query consulta UNA por TripId+role del usuario actual.
            // Hacemos uno por uno; si la lista es grande podemos optimizar después.
            var list = await _mediator.Send(new GetIncidentsByTripQuery(tripId), ct);
            var mine = list.FirstOrDefault(i =>
                i.ReportedByUserId == CurrentUserId &&
                i.ReportedByRole == CurrentUserRole);
            result[tripId] = mine;
        }

        return Ok(result);
    }

    /// <summary>
    /// POST /api/trips/incidents/counts
    /// Recibe lista de TripIds y devuelve {tripId: count}.
    /// Usado por el admin para mostrar badge en la lista de viajes.
    /// </summary>
    [HttpPost("counts")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewTrips)]
    public async Task<IActionResult> Counts(
        [FromBody] List<Guid> tripIds, CancellationToken ct)
    {
        var map = await _mediator.Send(new GetIncidentCountsQuery(tripIds ?? new()), ct);
        return Ok(map);
    }
}