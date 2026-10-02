using System.Net.Http.Json;
using System.Text;
using Microsoft.Extensions.Configuration;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Infrastructure.External;

/// <summary>
/// Entrega eventos a Rewards.Api por HTTP, autenticando con X-Internal-Token
/// (mismo patron que usa Auth para hablar con Drivers).
/// </summary>
public class RewardsClient : IRewardsClient
{
    private readonly HttpClient     _http;
    private readonly IConfiguration _cfg;

    public RewardsClient(HttpClient http, IConfiguration cfg)
    {
        _http = http;
        _cfg  = cfg;
    }

    public async Task<CouponValidation?> ValidateCouponAsync(
        string code, Guid userId, decimal fare,
        CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(
                HttpMethod.Post, "api/rewards/internal/coupon/validate")
            {
                Content = JsonContent.Create(new { code, userId, fare })
            };
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? string.Empty);

            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return null;

            return await res.Content.ReadFromJsonAsync<CouponValidation>(cancellationToken: ct);
        }
        catch
        {
            // Rewards caido: no se aplica nada y el pasajero reintenta. Nunca
            // se asume que el cupon es valido.
            return null;
        }
    }

    public async Task<bool> UseCouponAsync(
        string code, Guid tripId, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(
                HttpMethod.Post, $"api/rewards/internal/coupon/{code}/use")
            {
                Content = JsonContent.Create(new { referenceId = tripId, note = "Aplicado al viaje" })
            };
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? string.Empty);

            using var res = await _http.SendAsync(req, ct);
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<bool> SendAsync(
        string eventType, string payloadJson, CancellationToken ct = default)
    {
        var path = eventType switch
        {
            "trip.completed" => "api/rewards/internal/trip-completed",
            "trip.rated"     => "api/rewards/internal/trip-rated",
            _                => null
        };

        if (path is null) return false;   // tipo desconocido: no reintentar eternamente

        using var req = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = new StringContent(payloadJson, Encoding.UTF8, "application/json")
        };
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? string.Empty);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            return res.IsSuccessStatusCode;
        }
        catch (Exception)
        {
            // Rewards caido o sin red: el outbox reintentara.
            return false;
        }
    }
}
