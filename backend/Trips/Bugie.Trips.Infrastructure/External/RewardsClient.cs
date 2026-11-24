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

    public async Task<CouponValidation?> ReserveCouponAsync(
        string code, Guid userId, Guid tripId, decimal fare,
        CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(
                HttpMethod.Post, "api/rewards/internal/coupon/reserve")
            {
                Content = JsonContent.Create(new { code, userId, tripId, fare })
            };
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? string.Empty);

            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                Console.Error.WriteLine(
                    $"[Rewards] Reservar cupon {code} del viaje {tripId}: HTTP {(int)res.StatusCode}.");
                return null;
            }

            return await res.Content.ReadFromJsonAsync<CouponValidation>(cancellationToken: ct);
        }
        catch (Exception ex)
        {
            // Rewards caido: no se aplica nada y el pasajero reintenta. Nunca
            // se asume que el cupon es valido.
            Console.Error.WriteLine($"[Rewards] Reservar cupon {code} del viaje {tripId}: {ex.Message}");
            return null;
        }
    }

    public async Task<bool> ReleaseCouponAsync(
        string code, Guid tripId, DateTime requestedAtUtc, CancellationToken ct = default)
    {
        var payload = System.Text.Json.JsonSerializer.Serialize(
            new { code, tripId, requestedAt = DateTime.SpecifyKind(requestedAtUtc, DateTimeKind.Utc) });
        return await SendAsync("trip.coupon_released", payload, ct) == OutboxDelivery.Sent;
    }

    public async Task<OutboxDelivery> SendAsync(
        string eventType, string payloadJson, CancellationToken ct = default)
    {
        var path = eventType switch
        {
            "trip.completed"       => "api/rewards/internal/trip-completed",
            "trip.rated"           => "api/rewards/internal/trip-rated",
            "trip.coupon_used"     => "api/rewards/internal/coupon/consume",
            "trip.coupon_released" => "api/rewards/internal/coupon/release",
            _                      => null
        };

        if (path is null) return OutboxDelivery.Rejected;   // tipo desconocido: no reintentar eternamente

        using var req = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = new StringContent(payloadJson, Encoding.UTF8, "application/json")
        };
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? string.Empty);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if (res.IsSuccessStatusCode) return OutboxDelivery.Sent;

            // 5xx (y 408/429): Rewards con problemas pasajeros, se reintenta.
            // Otro 4xx: lo rechazo por el contenido, reintentar no lo arregla.
            var code = (int)res.StatusCode;
            return code >= 500 || code is 408 or 429
                ? OutboxDelivery.TransientFailure
                : OutboxDelivery.Rejected;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            // Rewards caido o sin red: el outbox reintentara.
            Console.Error.WriteLine($"[Rewards] {eventType}: sin respuesta ({ex.Message}).");
            return OutboxDelivery.TransientFailure;
        }
    }
}
