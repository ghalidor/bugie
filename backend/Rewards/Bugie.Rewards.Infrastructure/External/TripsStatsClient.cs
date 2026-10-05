using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Bugie.Rewards.Domain.External;

namespace Bugie.Rewards.Infrastructure.External;

public class TripsClientOptions
{
    public string BaseUrl       { get; set; } = "http://localhost:5002/";
    public string InternalToken { get; set; } = string.Empty;
}

public class TripsStatsClient : ITripsStatsClient
{
    private readonly HttpClient _http;
    private readonly TripsClientOptions _opt;
    private readonly ILogger<TripsStatsClient> _log;

    public TripsStatsClient(
        HttpClient http, IOptions<TripsClientOptions> opt, ILogger<TripsStatsClient> log)
    {
        _http = http;
        _opt  = opt.Value;
        _log  = log;
    }

    public async Task<List<DriverDayStats>?> GetDriverDayAsync(
        DateTime localDate, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(
                HttpMethod.Get,
                $"api/trips/internal/driver-day?date={localDate:yyyy-MM-dd}");
            req.Headers.Add("X-Internal-Token", _opt.InternalToken);

            using var res = await _http.SendAsync(req, ct);

            if (!res.IsSuccessStatusCode)
            {
                _log.LogWarning(
                    "Trips respondió {Status} al pedir el resumen de {Date:yyyy-MM-dd}",
                    (int)res.StatusCode, localDate);
                return null;
            }

            return await res.Content
                .ReadFromJsonAsync<List<DriverDayStats>>(cancellationToken: ct);
        }
        catch (Exception ex)
        {
            // Null significa "no se pudo saber". El proceso no paga nada y
            // reintenta mañana, que es mejor que pagar con datos incompletos.
            _log.LogError(ex, "No se pudo consultar el resumen diario a Trips.");
            return null;
        }
    }

    public async Task<TripRatingCheck?> GetRatingCheckAsync(
        Guid tripId, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(
                HttpMethod.Get, $"api/trips/internal/verify/rating/{tripId}");
            req.Headers.Add("X-Internal-Token", _opt.InternalToken);

            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                _log.LogWarning("Trips respondió {Status} al verificar la calificación del viaje {TripId}",
                    (int)res.StatusCode, tripId);
                return null;
            }
            return await res.Content.ReadFromJsonAsync<TripRatingCheck>(cancellationToken: ct);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "No se pudo verificar la calificación del viaje {TripId} en Trips.", tripId);
            return null;
        }
    }
}
