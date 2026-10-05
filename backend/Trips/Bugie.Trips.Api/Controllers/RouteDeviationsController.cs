using System.Security.Claims;
using Bugie.Trips.Application.Services;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Alertas de desvío de ruta para el admin (Monitoreo en vivo).
/// La detección la hace RouteDeviationService con cada GPS del conductor;
/// aquí solo se consultan y se marcan como revisadas.
/// </summary>
[ApiController]
[Route("api/trips/admin/deviations")]
[Authorize(Roles = "admin")]
public class RouteDeviationsController : ControllerBase
{
    private readonly IRouteDeviationRepository _repo;
    private readonly RouteDeviationService _service;

    public RouteDeviationsController(IRouteDeviationRepository repo, RouteDeviationService service)
    {
        _repo = repo;
        _service = service;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// GET /api/trips/admin/deviations/active
    /// Alertas sin revisar: abiertas, o cerradas de viajes que siguen activos.
    /// El admin las carga al abrir el mapa; luego llegan por SignalR.
    /// </summary>
    [HttpGet("active")]
    [RequirePermission(Perm.ViewLiveMap)]
    public async Task<IActionResult> Active(CancellationToken ct) =>
        Ok(await _repo.GetActiveAsync(ct));

    /// <summary>
    /// GET /api/trips/admin/deviations/trip/{tripId}
    /// Historial de desvíos de un viaje (para el detalle del viaje).
    /// </summary>
    [HttpGet("trip/{tripId:guid}")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewComplaints, Perm.ViewSosCenter, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewPayments, Perm.ViewCommissions)]
    public async Task<IActionResult> ByTrip(Guid tripId, CancellationToken ct) =>
        Ok(await _repo.GetByTripAsync(tripId, ct));

    /// <summary>
    /// GET /api/trips/admin/deviations/trip/{tripId}/planned-route
    /// Rutas planificadas del viaje (tramo 'pickup' y 'trip'), puntos [lat, lng].
    /// </summary>
    [HttpGet("trip/{tripId:guid}/planned-route")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewComplaints, Perm.ViewSosCenter, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewPayments, Perm.ViewCommissions)]
    public async Task<IActionResult> PlannedRoute(Guid tripId, CancellationToken ct)
    {
        var pickup = await _repo.GetPlannedRouteAsync(tripId, TripPlannedRoute.LegPickup, ct);
        var trip = await _repo.GetPlannedRouteAsync(tripId, TripPlannedRoute.LegTrip, ct);
        return Ok(new { pickup, trip });
    }

    /// <summary>
    /// PUT /api/trips/admin/deviations/{id}/review
    /// Body: { "note": "Llamé al conductor: desvío por obras." }
    /// Marca la alerta como revisada. La nota es obligatoria (auditoría).
    /// </summary>
    [HttpPut("{id:guid}/review")]
    [RequirePermission(Perm.ViewLiveMap, Perm.ViewSosCenter)]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewDeviationRequest req, CancellationToken ct)
    {
        var note = req?.Note?.Trim() ?? "";
        if(note.Length < 3)
            return BadRequest(new { error = "Escribe una nota de al menos 3 caracteres." });
        if(note.Length > 500) note = note[..500];

        var existing = await _repo.GetByIdAsync(id, ct);
        if(existing is null) return NotFound(new { error = "Alerta de desvío no encontrada." });
        if(existing.ReviewedAt is not null)
            return Conflict(new { error = "Esta alerta ya fue revisada." });

        var updated = await _service.ReviewAsync(id, CurrentUserId, note, ct);
        if(updated is null) return Conflict(new { error = "Esta alerta ya fue revisada." });
        return Ok(updated);
    }
}

public record ReviewDeviationRequest(string? Note);
