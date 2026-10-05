using Microsoft.AspNetCore.Mvc;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Recorrido REAL de un viaje (puntos GPS de drivers.LocationHistory) para
/// otros modulos. Lo usa Trips.Api para mostrarselo al pasajero del viaje
/// (Trips valida que quien pregunta sea participante).
/// Protegido por el token interno en el header X-Internal-Token.
/// </summary>
[ApiController]
[Route("api/drivers/internal/trips")]
public class TripPathInternalController : ControllerBase
{
    private readonly ILocationHistoryRepository _history;
    private readonly IConfiguration _cfg;

    public TripPathInternalController(ILocationHistoryRepository history, IConfiguration cfg)
    {
        _history = history;
        _cfg = cfg;
    }

    public record PathPointDto(double Lat, double Lng, DateTime RecordedAt);

    /// <summary>GET /api/drivers/internal/trips/{tripId}/path</summary>
    [HttpGet("{tripId:guid}/path")]
    public async Task<IActionResult> GetPath(
        Guid tripId,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        var expected = _cfg["InternalToken"];
        if(!Bugie.Drivers.Api.Security.InternalTokenCheck.Matches(token, expected))
            return Unauthorized(new { error = "Token interno inválido." });

        var points = (await _history.GetByTripAsync(tripId, ct))
            .OrderBy(p => p.RecordedAt)
            .Select(p => new PathPointDto(p.Lat, p.Lng, p.RecordedAt))
            .ToList();
        return Ok(points);
    }
}
