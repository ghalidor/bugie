using Microsoft.AspNetCore.Mvc;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Recorrido REAL de un viaje para otros modulos. Lo usa Trips.Api para
/// mostrarselo al pasajero del viaje (Trips valida que quien pregunta sea
/// participante). Viaje terminado: drivers.trippaths; en curso: GPS crudo.
/// Tambien recibe el aviso de Trips de que un viaje termino, para consolidar
/// su recorrido.
/// Protegido por el token interno en el header X-Internal-Token.
/// </summary>
[ApiController]
[Route("api/drivers/internal/trips")]
public class TripPathInternalController : ControllerBase
{
    private readonly TripPathReadService _reader;
    private readonly ITripPathConsolidationScheduler _consolidation;
    private readonly IConfiguration _cfg;

    public TripPathInternalController(
        TripPathReadService reader,
        ITripPathConsolidationScheduler consolidation,
        IConfiguration cfg)
    {
        _reader = reader;
        _consolidation = consolidation;
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

        var result = await _reader.GetAsync(tripId, ct);
        var points = result.Points
            .Select(p => new PathPointDto(p.Lat, p.Lng, p.RecordedAt))
            .ToList();
        return Ok(points);
    }

    /// <summary>
    /// POST /api/drivers/internal/trips/{tripId}/consolidate-path: Trips avisa
    /// que el viaje termino (completado o cancelado en curso). El recorrido se
    /// arma en drivers.trippaths unos segundos despues (GpsArchive:ConsolidateDelaySeconds),
    /// para que entren los ultimos puntos GPS. Si no llega el aviso, lo hace el
    /// job nocturno. Responde 202 al instante.
    /// </summary>
    [HttpPost("{tripId:guid}/consolidate-path")]
    public IActionResult ConsolidatePath(
        Guid tripId,
        [FromHeader(Name = "X-Internal-Token")] string? token)
    {
        var expected = _cfg["InternalToken"];
        if(!Bugie.Drivers.Api.Security.InternalTokenCheck.Matches(token, expected))
            return Unauthorized(new { error = "Token interno inválido." });

        _consolidation.Schedule(tripId);
        return Accepted(new { tripId, scheduled = true });
    }
}
