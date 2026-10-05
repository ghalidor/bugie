using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Recorrido REAL de un viaje pasado, visto por el propio conductor (web de
/// consulta, historial). Usa los mismos puntos GPS que el admin
/// (drivers.LocationHistory), pero solo devuelve los puntos que mando
/// el conductor del token: si el viaje no es suyo, responde 404.
/// </summary>
[ApiController]
[Route("api/drivers/me/trips")]
[Authorize(Roles = "driver")]
public class MyTripPathController : ControllerBase
{
    private readonly ILocationHistoryRepository _history;
    private readonly IDriverRepository          _drivers;

    public MyTripPathController(ILocationHistoryRepository history, IDriverRepository drivers)
    {
        _history = history;
        _drivers = drivers;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record PathPointDto(double Lat, double Lng, DateTime RecordedAt);

    public record TripPathDto(
        Guid               TripId,
        int                Points,
        double             DistanceKm,
        DateTime?          FirstAt,
        DateTime?          LastAt,
        List<PathPointDto> Path);

    /// <summary>GET /api/drivers/me/trips/{tripId}/path</summary>
    [HttpGet("{tripId:guid}/path")]
    public async Task<IActionResult> GetMyPath(Guid tripId, CancellationToken ct)
    {
        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if (driver is null) return NotFound(new { error = "Conductor no encontrado." });

        var all = await _history.GetByTripAsync(tripId, ct);

        // Solo los puntos del conductor del token. Si el viaje tiene puntos
        // pero ninguno es suyo, el viaje no es de este conductor.
        var points = all
            .Where(p => p.DriverId == driver.Id)
            .OrderBy(p => p.RecordedAt)
            .ToList();
        if (all.Count > 0 && points.Count == 0)
            return NotFound(new { error = "Viaje no encontrado." });

        double km = 0;
        for (var i = 1; i < points.Count; i++)
            km += Haversine(points[i - 1].Lat, points[i - 1].Lng, points[i].Lat, points[i].Lng);

        return Ok(new TripPathDto(
            tripId,
            points.Count,
            Math.Round(km, 2),
            points.FirstOrDefault()?.RecordedAt,
            points.LastOrDefault()?.RecordedAt,
            points.Select(p => new PathPointDto(p.Lat, p.Lng, p.RecordedAt)).ToList()));
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
