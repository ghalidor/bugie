using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Bugie.Payments.Domain.External;
using Bugie.Payments.Infrastructure.Time;

namespace Bugie.Payments.Infrastructure.External;

/// <summary>
/// GET  {Services:RewardsApi}/api/rewards/internal/payout-codes/{code}
/// POST {Services:RewardsApi}/api/rewards/internal/payout-codes/{code}/settle
/// (BaseAddress y X-Internal-Token los configura Program.cs).
/// </summary>
public class RewardsPayoutCodeClient : IPayoutCodeClient
{
    // Rewards devuelve fechas en hora de Peru: el conversor las deja en UTC.
    private static readonly JsonSerializerOptions Json =
        new(JsonSerializerDefaults.Web) { Converters = { new PeruDateTimeJsonConverter() } };
    private readonly HttpClient _http;
    public RewardsPayoutCodeClient(HttpClient http) => _http = http;

    public async Task<PayoutCodeInfo?> LookupAsync(string code, CancellationToken ct = default)
    {
        HttpResponseMessage res;
        try
        {
            res = await _http.GetAsync($"api/rewards/internal/payout-codes/{Uri.EscapeDataString(code)}", ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new InvalidOperationException("No se pudo consultar el código: el módulo de recompensas no responde.");
        }

        using (res)
        {
            if (res.StatusCode == HttpStatusCode.NotFound) return null;
            if (!res.IsSuccessStatusCode)
                throw new InvalidOperationException("No se pudo consultar el código. Intenta de nuevo.");
            return await res.Content.ReadFromJsonAsync<PayoutCodeInfo>(Json, ct);
        }
    }

    public async Task<string?> SettleAsync(string code, Guid adminId, string? note, CancellationToken ct = default)
    {
        try
        {
            using var res = await _http.PostAsJsonAsync(
                $"api/rewards/internal/payout-codes/{Uri.EscapeDataString(code)}/settle",
                new { adminId, note }, ct);
            if (res.IsSuccessStatusCode) return null;
            var body = await res.Content.ReadFromJsonAsync<ErrorBody>(Json, ct);
            return body?.Error ?? "No se pudo marcar el código como pagado.";
        }
        catch (Exception)
        {
            return "El módulo de recompensas no respondió al marcar el código como pagado.";
        }
    }

    private record ErrorBody(string? Error);
}
