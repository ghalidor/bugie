using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Bugie.Trips.Domain.Interfaces;
using System.Text.Json;

namespace Bugie.Trips.Infrastructure.Services;

public class GraphHopperRoutingService : IRoutingService
{
    private readonly HttpClient _http;
    private readonly string _baseUrl;
    /// <summary>
    /// Factor que multiplica el tiempo devuelto por GraphHopper. GraphHopper
    /// asume velocidades de manual (sin tráfico real), por eso da tiempos
    /// muy optimistas. En Trujillo urbano con semáforos y tráfico, la
    /// velocidad promedio real es de ~22 km/h vs los ~40 km/h que asume GH.
    /// Factor 1.8 corrige esa diferencia. Configurable en appsettings.
    /// </summary>
    private readonly double _durationFactor;

    public GraphHopperRoutingService(HttpClient http, IConfiguration config)
    {
        _http = http;
        _baseUrl = config["GraphHopper:BaseUrl"] ?? "http://localhost:8989";
        _durationFactor = double.TryParse(
            config["GraphHopper:DurationFactor"],
            System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture,
            out var f) ? f : 1.8;
    }

    public async Task<RouteResult?> GetRouteAsync(
       double originLat, double originLng,
       double destLat, double destLng,
       CancellationToken ct = default)
    {
        try
        {
            var url = $"{_baseUrl}/route" +
                $"?point={originLat.ToString(System.Globalization.CultureInfo.InvariantCulture)},{originLng.ToString(System.Globalization.CultureInfo.InvariantCulture)}" +
                $"&point={destLat.ToString(System.Globalization.CultureInfo.InvariantCulture)},{destLng.ToString(System.Globalization.CultureInfo.InvariantCulture)}" +
                $"&profile=car&locale=es&points_encoded=false" +
                $"&algorithm=alternative_route&alternative_route.max_paths=3&alternative_route.max_weight_factor=1.4&alternative_route.max_share_factor=0.6";

            var json = await _http.GetStringAsync(url, ct);

            var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var res = JsonSerializer.Deserialize<GhResponse>(json, opts);

            if(res?.Paths is null || res.Paths.Count == 0) return null;

            return new RouteResult
            {
                DistanceMeters = res.Paths[0].Distance,
                // Aplicamos factor urbano: GraphHopper da tiempos sin tráfico,
                // los corregimos para reflejar tiempos reales en Trujillo.
                DurationSeconds = (res.Paths[0].Time / 1000.0) * _durationFactor,
                Options = res.Paths.Select(p => new RouteOption
                {
                    DistanceMeters = p.Distance,
                    DurationSeconds = (p.Time / 1000.0) * _durationFactor,
                    Coordinates = p.Points.Coordinates,
                }).ToList(),
            };
        }
        catch
        {
            return null;
        }
    }

    private class GhResponse
    {
        public List<GhPath> Paths { get; set; } = new();
    }

    private class GhPath
    {
        public double Distance { get; set; }
        public long Time { get; set; }
        public GhGeometry Points { get; set; } = new();
    }

    private class GhGeometry
    {
        public string Type { get; set; } = "";
        public List<double[]> Coordinates { get; set; } = new();
    }
}
