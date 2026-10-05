using System.Security.Claims;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Ruta planificada por el sistema para un viaje, vista por sus participantes
/// (el pasajero o el conductor de ese viaje). La usa el historial web para
/// comparar "ruta del sistema" vs "recorrido real".
/// El admin tiene su propio endpoint en RouteDeviationsController.
/// </summary>
[ApiController]
[Route("api/trips")]
[Authorize]
public class TripRoutesController : ControllerBase
{
    private readonly ITripRepository _trips;
    private readonly IRouteDeviationRepository _routes;
    private readonly IDriversClient _drivers;

    public TripRoutesController(ITripRepository trips, IRouteDeviationRepository routes, IDriversClient drivers)
    {
        _trips = trips;
        _routes = routes;
        _drivers = drivers;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// GET /api/trips/{id}/planned-route
    /// Devuelve { pickup, trip }: cada uno con source ('graphhopper' | 'straight'),
    /// points [[lat, lng], ...] y distanceMeters. Son null si el viaje no tiene
    /// ruta guardada (viajes antiguos). Tambien devuelve origin, stops y
    /// destination para que el cliente dibuje la "ruta estimada" (linea recta)
    /// cuando no hay ruta guardada.
    /// </summary>
    [HttpGet("{id:guid}/planned-route")]
    public async Task<IActionResult> PlannedRoute(Guid id, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        // 404 tambien si no es participante: no revelamos que el viaje existe.
        if(trip is null || (trip.PassengerId != CurrentUserId && trip.DriverId != CurrentUserId))
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

    /// <summary>
    /// GET /api/trips/{id}/real-path
    /// Recorrido REAL del conductor en el viaje (puntos GPS que guarda Drivers).
    /// Solo para participantes. Devuelve { points, distanceKm, path: [{lat, lng, recordedAt}] }.
    /// </summary>
    [HttpGet("{id:guid}/real-path")]
    public async Task<IActionResult> RealPath(Guid id, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null || (trip.PassengerId != CurrentUserId && trip.DriverId != CurrentUserId))
            return NotFound(new { error = "Viaje no encontrado." });

        var path = await _drivers.GetTripPathAsync(id, ct);
        double km = 0;
        for(var i = 1; i < path.Count; i++)
            km += Haversine(path[i - 1].Lat, path[i - 1].Lng, path[i].Lat, path[i].Lng);

        return Ok(new { points = path.Count, distanceKm = Math.Round(km, 2), path });
    }

    private static double Haversine(double lat1, double lng1, double lat2, double lng2)
    {
        const double R = 6371;
        double rad(double d) => d * Math.PI / 180;
        var dLat = rad(lat2 - lat1);
        var dLng = rad(lng2 - lng1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
              + Math.Cos(rad(lat1)) * Math.Cos(rad(lat2)) * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return 2 * R * Math.Asin(Math.Sqrt(a));
    }
}
