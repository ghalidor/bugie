using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Recorrido REAL de un viaje: los puntos GPS que mando el conductor durante
/// el viaje (drivers.LocationHistory). Lo usa el admin para revisar en el mapa
/// por donde fue un viaje.
/// </summary>
[ApiController]
[Route("api/drivers/admin/trips")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewComplaints, Perm.ViewSosCenter, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewPayments, Perm.ViewCommissions)]
public class TripPathController : ControllerBase
{
    private readonly ILocationHistoryRepository _history;
    public TripPathController(ILocationHistoryRepository history) => _history = history;

    public record PathPointDto(double Lat, double Lng, double? SpeedKmh, double? Heading, DateTime RecordedAt);

    public record TripPathDto(
        Guid               TripId,
        int                Points,
        double             DistanceKm,
        DateTime?          FirstAt,
        DateTime?          LastAt,
        List<PathPointDto> Path);

    /// <summary>GET /api/drivers/admin/trips/{tripId}/path</summary>
    [HttpGet("{tripId:guid}/path")]
    public async Task<IActionResult> GetPath(Guid tripId, CancellationToken ct)
    {
        var points = (await _history.GetByTripAsync(tripId, ct))
            .OrderBy(p => p.RecordedAt)
            .ToList();

        double km = 0;
        for (var i = 1; i < points.Count; i++)
            km += Haversine(points[i - 1].Lat, points[i - 1].Lng, points[i].Lat, points[i].Lng);

        return Ok(new TripPathDto(
            tripId,
            points.Count,
            Math.Round(km, 2),
            points.FirstOrDefault()?.RecordedAt,
            points.LastOrDefault()?.RecordedAt,
            points.Select(p => new PathPointDto(p.Lat, p.Lng, p.SpeedKmh, p.Heading, p.RecordedAt)).ToList()));
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
