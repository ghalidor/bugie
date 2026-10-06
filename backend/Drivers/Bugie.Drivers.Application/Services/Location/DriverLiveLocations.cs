using System.Collections.Concurrent;

namespace Bugie.Drivers.Application.Services.Location;

/// <summary>
/// Ultima posicion de cada conductor en memoria (singleton).
///
/// Es la fuente que leen /nearby, /online (mapa del admin) y
/// by-user/{id}/location. La base solo se usa cuando aqui no hay dato
/// (p.ej. recien reiniciada la API) o cuando el dato es mas viejo que
/// LocationOptions.StaleMinutes.
///
/// Tambien aplica el filtro de puntos repetidos: un punto a menos de
/// MinMeters y menos de MinSeconds del ultimo aceptado del mismo conductor
/// se descarta. El primero siempre pasa.
/// </summary>
public class DriverLiveLocations
{
    private readonly ConcurrentDictionary<Guid, DriverLocationSample> _byUser = new();

    public int Count => _byUser.Count;

    /// <summary>Ultima posicion del conductor (por UserId), o null si no hay o es muy vieja.</summary>
    public DriverLocationSample? Get(Guid userId, TimeSpan maxAge)
    {
        if(!_byUser.TryGetValue(userId, out var s)) return null;
        return DateTime.UtcNow - s.ReceivedAtUtc <= maxAge ? s : null;
    }

    /// <summary>Todas las posiciones vigentes (no mas viejas que maxAge).</summary>
    public IReadOnlyCollection<DriverLocationSample> GetAll(TimeSpan maxAge)
    {
        var cutoff = DateTime.UtcNow - maxAge;
        return _byUser.Values.Where(s => s.ReceivedAtUtc >= cutoff).ToList();
    }

    /// <summary>
    /// Intenta aceptar el punto. Devuelve false si se descarta por estar demasiado
    /// cerca y demasiado seguido del ultimo aceptado, o por venir desordenado
    /// (mas viejo que el ultimo aceptado). Si lo acepta, queda como posicion actual.
    /// </summary>
    public bool TryAccept(DriverLocationSample sample, double minMeters, double minSeconds)
    {
        while(true)
        {
            if(!_byUser.TryGetValue(sample.UserId, out var last))
            {
                if(_byUser.TryAdd(sample.UserId, sample)) return true;
                continue;   // otro hilo lo agrego primero: reevaluamos
            }

            var dt = (sample.RecordedAtUtc - last.RecordedAtUtc).TotalSeconds;
            if(dt < 0) return false;    // desordenado o repetido

            // Mismo viaje/estado y casi sin moverse en muy poco tiempo: ruido del GPS.
            if(dt < minSeconds && Haversine(last.Lat, last.Lng, sample.Lat, sample.Lng) < minMeters
               && last.TripId == sample.TripId)
                return false;

            if(_byUser.TryUpdate(sample.UserId, sample, last)) return true;
            // Otro hilo cambio la posicion entre medio: reevaluamos con la nueva.
        }
    }

    /// <summary>Saca de memoria las posiciones mas viejas que maxAge (limpieza periodica).</summary>
    public int RemoveStale(TimeSpan maxAge)
    {
        var cutoff = DateTime.UtcNow - maxAge;
        var removed = 0;
        foreach(var kv in _byUser)
        {
            if(kv.Value.ReceivedAtUtc < cutoff &&
               _byUser.TryRemove(new KeyValuePair<Guid, DriverLocationSample>(kv.Key, kv.Value)))
                removed++;
        }
        return removed;
    }

    /// <summary>Distancia en metros entre dos coordenadas.</summary>
    public static double Haversine(double lat1, double lng1, double lat2, double lng2)
    {
        const double R = 6371000;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(lat1 * Math.PI / 180) * Math.Cos(lat2 * Math.PI / 180) *
                Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        return R * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
    }
}
