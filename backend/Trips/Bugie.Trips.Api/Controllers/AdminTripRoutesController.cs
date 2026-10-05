using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Ruta planificada (ruta del sistema) de CUALQUIER viaje, para el admin.
/// Misma forma que GET /api/trips/{id}/planned-route (que solo sirve a los
/// participantes del viaje). El recorrido REAL lo da Drivers:
/// GET /api/drivers/admin/trips/{tripId}/path.
///
///   GET /api/trips/admin/trips/{id}/planned-route
/// </summary>
[ApiController]
[Route("api/trips/admin/trips")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewComplaints, Perm.ViewSosCenter, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewPayments, Perm.ViewCommissions)]
public class AdminTripRoutesController : ControllerBase
{
    private readonly ITripRepository _trips;
    private readonly IRouteDeviationRepository _routes;

    public AdminTripRoutesController(ITripRepository trips, IRouteDeviationRepository routes)
    {
        _trips = trips;
        _routes = routes;
    }

    /// <summary>
    /// { pickup, trip, origin, destination, stops }. pickup/trip son null si el
    /// viaje no tiene ruta guardada (viajes antiguos). 404 si el viaje no existe.
    /// </summary>
    [HttpGet("{id:guid}/planned-route")]
    public async Task<IActionResult> PlannedRoute(Guid id, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if (trip is null)
            return NotFound(new { error = "Viaje no encontrado." });

        var pickup = await _routes.GetPlannedRouteAsync(id, TripPlannedRoute.LegPickup, ct);
        var route  = await _routes.GetPlannedRouteAsync(id, TripPlannedRoute.LegTrip, ct);
        var stops  = (await _trips.GetWaypointsAsync(id, ct))
            .OrderBy(w => w.SortOrder)
            .Select(w => new { lat = w.Lat, lng = w.Lng, address = w.Address })
            .ToList();

        return Ok(new
        {
            pickup = pickup is null ? null : new { pickup.Source, pickup.Points, pickup.DistanceMeters },
            trip   = route  is null ? null : new { route.Source,  route.Points,  route.DistanceMeters },
            origin      = new { lat = trip.OriginLat, lng = trip.OriginLng, address = trip.OriginAddress },
            destination = new { lat = trip.DestLat,   lng = trip.DestLng,   address = trip.DestAddress },
            stops,
        });
    }
}
