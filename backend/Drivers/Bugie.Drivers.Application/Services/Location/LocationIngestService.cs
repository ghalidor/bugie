using System.Collections.Concurrent;
using Bugie.Drivers.Domain.Interfaces;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Application.Services.Location;

/// <summary>
/// Camino unico de entrada del GPS del conductor (lo usan PUT /location y
/// PUT /location/batch):
///   1. resuelve el DriverId del usuario (cache en memoria; la base solo la
///      primera vez por conductor),
///   2. descarta puntos invalidos, muy viejos o del futuro,
///   3. aplica el filtro de puntos repetidos y deja la posicion en memoria
///      (DriverLiveLocations),
///   4. encola el punto para que el writer lo escriba en la base y avise a Trips.
/// No toca la base en la peticion (salvo el paso 1 la primera vez).
/// </summary>
public class LocationIngestService
{
    // UserId -> DriverId. No cambia nunca, asi que vive todo el proceso.
    private static readonly ConcurrentDictionary<Guid, Guid> DriverIdByUser = new();

    private readonly IDriverRepository _drivers;
    private readonly DriverLiveLocations _live;
    private readonly LocationQueue _queue;
    private readonly LocationOptions _opts;

    public LocationIngestService(IDriverRepository drivers, DriverLiveLocations live,
                                 LocationQueue queue, IOptions<LocationOptions> opts)
    {
        _drivers = drivers;
        _live = live;
        _queue = queue;
        _opts = opts.Value;
    }

    /// <summary>Un solo punto con la hora del servidor (PUT /location).</summary>
    public Task<LocationIngestResult> IngestAsync(Guid userId, double lat, double lng, Guid? tripId,
                                                  double? speedKmh, double? heading, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        return IngestAsync(userId, tripId,
            new[] { new LocationPointInput(lat, lng, now, speedKmh, heading) }, ct);
    }

    /// <summary>
    /// Varios puntos del mismo conductor (PUT /location/batch). Se ordenan por
    /// RecordedAt; los invalidos se descartan y se cuentan, no cortan el lote.
    /// Lanza KeyNotFoundException si el usuario no es conductor (404).
    /// </summary>
    public async Task<LocationIngestResult> IngestAsync(Guid userId, Guid? tripId,
                                                        IReadOnlyList<LocationPointInput> points,
                                                        CancellationToken ct)
    {
        var driverId = await ResolveDriverIdAsync(userId, ct);
        var now = DateTime.UtcNow;
        var minAt = now.AddMinutes(-_opts.MaxAgeMinutes);
        var maxAt = now.AddMinutes(_opts.MaxFutureMinutes);

        var received = points.Count;
        var accepted = 0;

        foreach(var p in points.OrderBy(p => p.RecordedAt))
        {
            var at = Bugie.Drivers.Domain.Common.BugieTime.ToUtcFromInput(p.RecordedAt);
            if(!IsValidCoordinate(p.Lat, p.Lng) || at < minAt || at > maxAt) continue;

            var sample = new DriverLocationSample(driverId, userId, p.Lat, p.Lng,
                Sanitize(p.SpeedKmh), Sanitize(p.Heading), tripId, at, now);

            if(!_live.TryAccept(sample, _opts.MinMeters, _opts.MinSeconds)) continue;

            _queue.Enqueue(sample);
            accepted++;
        }

        var discarded = received - accepted;
        _queue.CountReceived(received);
        _queue.CountAccepted(accepted);
        _queue.CountDiscarded(discarded);
        return new LocationIngestResult(received, accepted, discarded);
    }

    private async Task<Guid> ResolveDriverIdAsync(Guid userId, CancellationToken ct)
    {
        if(DriverIdByUser.TryGetValue(userId, out var id)) return id;
        var d = await _drivers.GetByUserIdAsync(userId, ct)
            ?? throw new KeyNotFoundException("Conductor no encontrado.");
        DriverIdByUser[userId] = d.Id;
        return d.Id;
    }

    private static bool IsValidCoordinate(double lat, double lng) =>
        !double.IsNaN(lat) && !double.IsNaN(lng) &&
        lat is >= -90 and <= 90 && lng is >= -180 and <= 180 &&
        !(lat == 0 && lng == 0);

    private static double? Sanitize(double? v) =>
        v is null || double.IsNaN(v.Value) || double.IsInfinity(v.Value) ? null : v;
}
