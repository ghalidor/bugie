using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Services;

/// <summary>
/// Recorrido de un viaje y de donde salio:
///   "consolidated" = drivers.trippaths (viaje terminado),
///   "raw"          = drivers.locationhistory (viaje en curso o recien terminado),
///   "none"         = sin puntos.
/// </summary>
public record TripPathReadResult(List<TripPathPoint> Points, string Source)
{
    public double DistanceKm => TripPathReadService.DistanceKm(Points);
}

/// <summary>
/// Lectura del recorrido real de un viaje para admin, web, app y Trips.
/// Primero drivers.trippaths (una fila, al instante); si el viaje todavia no
/// esta consolidado (en curso o recien terminado), el GPS crudo de
/// drivers.locationhistory como siempre.
/// </summary>
public class TripPathReadService
{
    private readonly ITripPathRepository        _paths;
    private readonly ILocationHistoryRepository _history;

    public TripPathReadService(ITripPathRepository paths, ILocationHistoryRepository history)
    {
        _paths   = paths;
        _history = history;
    }

    public async Task<TripPathReadResult> GetAsync(Guid tripId, CancellationToken ct = default)
    {
        var path = await _paths.GetAsync(tripId, ct);
        if (path is not null)
            return new TripPathReadResult(path.Decode(), "consolidated");

        var raw = (await _history.GetByTripAsync(tripId, ct))
            .OrderBy(p => p.RecordedAt)
            .Select(p => new TripPathPoint(p.DriverId, p.Lat, p.Lng, p.SpeedKmh, p.Heading, p.RecordedAt))
            .ToList();
        return new TripPathReadResult(raw, raw.Count > 0 ? "raw" : "none");
    }

    /// <summary>Distancia recorrida (km) sumando tramo a tramo (haversine).</summary>
    public static double DistanceKm(IReadOnlyList<TripPathPoint> points)
    {
        double km = 0;
        for (var i = 1; i < points.Count; i++)
            km += Haversine(points[i - 1].Lat, points[i - 1].Lng, points[i].Lat, points[i].Lng);
        return km;
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
