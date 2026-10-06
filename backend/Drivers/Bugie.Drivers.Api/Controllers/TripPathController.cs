using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Recorrido REAL de un viaje: los puntos GPS que mando el conductor durante
/// el viaje. Lo usa el admin para revisar en el mapa por donde fue un viaje.
/// Viaje terminado: se lee de drivers.trippaths (consolidado, una fila).
/// Viaje en curso o recien terminado: del GPS crudo (drivers.locationhistory).
/// </summary>
[ApiController]
[Route("api/drivers/admin/trips")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewComplaints, Perm.ViewSosCenter, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewPayments, Perm.ViewCommissions)]
public class TripPathController : ControllerBase
{
    private readonly TripPathReadService _reader;
    private readonly ILocationHistoryRepository _history;
    private readonly ITripPathRepository _paths;
    private readonly IGpsArchiveStore _archive;

    public TripPathController(
        TripPathReadService reader,
        ILocationHistoryRepository history,
        ITripPathRepository paths,
        IGpsArchiveStore archive)
    {
        _reader  = reader;
        _history = history;
        _paths   = paths;
        _archive = archive;
    }

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
        var result = await _reader.GetAsync(tripId, ct);
        return Ok(ToDto(tripId, result.Points));
    }

    /// <summary>
    /// GET /api/drivers/admin/trips/{tripId}/path/raw: el GPS crudo del viaje.
    /// Si todavia esta en la base (ultimos dias) sale de drivers.locationhistory;
    /// si ya se archivo, se busca en los Parquet de los dias del viaje (por el
    /// startedat/endedat del recorrido consolidado). Misma forma que /path mas
    /// "source": "db" | "parquet" | "none".
    /// </summary>
    [HttpGet("{tripId:guid}/path/raw")]
    public async Task<IActionResult> GetRawPath(Guid tripId, CancellationToken ct)
    {
        var raw = (await _history.GetByTripAsync(tripId, ct))
            .OrderBy(p => p.RecordedAt)
            .Select(p => new TripPathPoint(p.DriverId, p.Lat, p.Lng, p.SpeedKmh, p.Heading, p.RecordedAt))
            .ToList();
        if (raw.Count > 0)
            return Ok(new { source = "db", path = ToDto(tripId, raw) });

        // Ya no esta en la base: los dias (UTC) que cubre el viaje segun el consolidado.
        var consolidated = await _paths.GetAsync(tripId, ct);
        if (consolidated is null)
            return Ok(new { source = "none", path = ToDto(tripId, raw) });

        var points = new List<TripPathPoint>();
        var files  = new List<string>();
        var day    = DateOnly.FromDateTime(consolidated.StartedAt);
        var last   = DateOnly.FromDateTime(consolidated.EndedAt);
        for (; day <= last; day = day.AddDays(1))
        {
            var rows = await _archive.ReadTripAsync(day, tripId, ct);
            if (rows.Count == 0) continue;
            files.Add(Path.GetFileName(_archive.FilePathFor(day)));
            points.AddRange(rows.Select(r => new TripPathPoint(r.DriverId, r.Lat, r.Lng, r.SpeedKmh, r.Heading, r.RecordedAt)));
        }
        points = points.OrderBy(p => p.RecordedAt).ToList();
        return Ok(new { source = points.Count > 0 ? "parquet" : "none", files, path = ToDto(tripId, points) });
    }

    private static TripPathDto ToDto(Guid tripId, List<TripPathPoint> points) => new(
        tripId,
        points.Count,
        Math.Round(TripPathReadService.DistanceKm(points), 2),
        points.FirstOrDefault()?.RecordedAt,
        points.LastOrDefault()?.RecordedAt,
        points.Select(p => new PathPointDto(p.Lat, p.Lng, p.SpeedKmh, p.Heading, p.RecordedAt)).ToList());
}
