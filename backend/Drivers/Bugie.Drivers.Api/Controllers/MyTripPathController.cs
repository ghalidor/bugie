using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Recorrido REAL de un viaje pasado, visto por el propio conductor (web de
/// consulta, historial). Usa los mismos puntos GPS que el admin (consolidado
/// en drivers.trippaths o crudo en drivers.locationhistory), pero solo
/// devuelve los puntos que mando el conductor del token: si el viaje no es
/// suyo, responde 404.
/// </summary>
[ApiController]
[Route("api/drivers/me/trips")]
[Authorize(Roles = "driver")]
public class MyTripPathController : ControllerBase
{
    private readonly TripPathReadService _reader;
    private readonly IDriverRepository   _drivers;

    public MyTripPathController(TripPathReadService reader, IDriverRepository drivers)
    {
        _reader  = reader;
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

        var all = (await _reader.GetAsync(tripId, ct)).Points;

        // Solo los puntos del conductor del token. Si el viaje tiene puntos
        // pero ninguno es suyo, el viaje no es de este conductor.
        var points = all
            .Where(p => p.DriverId == driver.Id)
            .OrderBy(p => p.RecordedAt)
            .ToList();
        if (all.Count > 0 && points.Count == 0)
            return NotFound(new { error = "Viaje no encontrado." });

        return Ok(new TripPathDto(
            tripId,
            points.Count,
            Math.Round(TripPathReadService.DistanceKm(points), 2),
            points.FirstOrDefault()?.RecordedAt,
            points.LastOrDefault()?.RecordedAt,
            points.Select(p => new PathPointDto(p.Lat, p.Lng, p.RecordedAt)).ToList()));
    }
}
