using System.Text.Json;

namespace Bugie.Drivers.Domain.Entities;

/// <summary>Un punto GPS del recorrido de un viaje (ya sea del crudo o del consolidado).</summary>
public record TripPathPoint(Guid DriverId, double Lat, double Lng, double? SpeedKmh, double? Heading, DateTime RecordedAt);

/// <summary>
/// Recorrido consolidado de un viaje (drivers.trippaths): una fila por viaje,
/// armada desde drivers.locationhistory al terminar el viaje (o por el job
/// nocturno). El detalle de viajes pasados se lee de aqui, no del GPS crudo.
///
/// Points es una polilinea codificada (algoritmo de Google) con factor 1e6
/// (la misma que arma drivers.encode_polyline en la base). Details es el
/// jsonb {"t":[ms desde StartedAt], "s":[km/h], "h":[rumbo]} en el mismo orden.
/// </summary>
public class TripPath
{
    public const int PolylineFactor = 1_000_000;

    public Guid     TripId         { get; private set; }
    public Guid     DriverId       { get; private set; }
    public int      PointCount     { get; private set; }
    public double   DistanceKm     { get; private set; }
    public DateTime StartedAt      { get; private set; }
    public DateTime EndedAt        { get; private set; }
    public string   Points         { get; private set; } = string.Empty;
    public string?  Details        { get; private set; }
    public DateTime ConsolidatedAt { get; private set; }

    private TripPath() { }

    /// <summary>Puntos del recorrido en orden cronologico.</summary>
    public List<TripPathPoint> Decode()
    {
        var coords = DecodePolyline(Points);
        var (times, speeds, headings) = ParseDetails(Details, coords.Count);

        var result = new List<TripPathPoint>(coords.Count);
        for (var i = 0; i < coords.Count; i++)
        {
            var at = times[i].HasValue ? StartedAt.AddMilliseconds(times[i]!.Value) : StartedAt;
            result.Add(new TripPathPoint(DriverId, coords[i].Lat, coords[i].Lng, speeds[i], headings[i], at));
        }
        return result;
    }

    /// <summary>Decodifica una polilinea de Google con el factor indicado.</summary>
    public static List<(double Lat, double Lng)> DecodePolyline(string encoded, int factor = PolylineFactor)
    {
        var result = new List<(double, double)>();
        if (string.IsNullOrEmpty(encoded)) return result;

        var index = 0;
        long lat = 0, lng = 0;
        while (index < encoded.Length)
        {
            lat += ReadValue(encoded, ref index);
            if (index >= encoded.Length) break;
            lng += ReadValue(encoded, ref index);
            result.Add(((double)lat / factor, (double)lng / factor));
        }
        return result;
    }

    private static long ReadValue(string s, ref int index)
    {
        long result = 0;
        var shift = 0;
        int b;
        do
        {
            b = s[index++] - 63;
            result |= (long)(b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20 && index < s.Length);
        return (result & 1) != 0 ? ~(result >> 1) : result >> 1;
    }

    private static (long?[] Times, double?[] Speeds, double?[] Headings) ParseDetails(string? json, int count)
    {
        var times    = new long?[count];
        var speeds   = new double?[count];
        var headings = new double?[count];
        if (string.IsNullOrWhiteSpace(json)) return (times, speeds, headings);

        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Object) return (times, speeds, headings);

        if (doc.RootElement.TryGetProperty("t", out var t)) FillLongs(t, times);
        if (doc.RootElement.TryGetProperty("s", out var s)) FillDoubles(s, speeds);
        if (doc.RootElement.TryGetProperty("h", out var h)) FillDoubles(h, headings);
        return (times, speeds, headings);
    }

    private static void FillLongs(JsonElement arr, long?[] target)
    {
        if (arr.ValueKind != JsonValueKind.Array) return;
        var i = 0;
        foreach (var e in arr.EnumerateArray())
        {
            if (i >= target.Length) break;
            target[i++] = e.ValueKind == JsonValueKind.Number ? (long)Math.Round(e.GetDouble()) : null;
        }
    }

    private static void FillDoubles(JsonElement arr, double?[] target)
    {
        if (arr.ValueKind != JsonValueKind.Array) return;
        var i = 0;
        foreach (var e in arr.EnumerateArray())
        {
            if (i >= target.Length) break;
            target[i++] = e.ValueKind == JsonValueKind.Number ? e.GetDouble() : null;
        }
    }
}
