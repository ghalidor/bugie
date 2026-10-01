using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Bugie.Rewards.Domain.External;

namespace Bugie.Rewards.Infrastructure.External;

/// <summary>
/// Pide los tokens FCM al modulo Auth por HTTP interno.
/// Rewards nunca lee auth.userfcmtokens directamente.
/// </summary>
public class AuthTokensClient : IAuthTokensClient
{
    private readonly HttpClient _http;
    private readonly IConfiguration _cfg;
    private readonly ILogger<AuthTokensClient> _log;

    public AuthTokensClient(HttpClient http, IConfiguration cfg, ILogger<AuthTokensClient> log)
    {
        _http = http;
        _cfg  = cfg;
        _log  = log;
    }

    private sealed class TokenRow
    {
        public Guid    UserId   { get; set; }
        public string  Token    { get; set; } = string.Empty;
        public string? Platform { get; set; }
    }

    public async Task<List<UserFcmToken>> GetTokensAsync(
        IEnumerable<Guid> userIds, CancellationToken ct = default)
    {
        var ids = userIds?.Distinct().ToList() ?? new List<Guid>();
        if (ids.Count == 0) return new List<UserFcmToken>();

        var query = string.Join("&", ids.Select(id => $"ids={id}"));
        var url   = $"api/internal/fcm-tokens/by-users?{query}";

        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? string.Empty);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                _log.LogWarning("Auth respondio {Status} al pedir tokens FCM.", res.StatusCode);
                return new List<UserFcmToken>();
            }

            var rows = await res.Content.ReadFromJsonAsync<List<TokenRow>>(cancellationToken: ct);
            return rows?.Select(r => new UserFcmToken(r.UserId, r.Token, r.Platform)).ToList()
                   ?? new List<UserFcmToken>();
        }
        catch (Exception ex)
        {
            // Sin tokens no hay push, pero el vencimiento de puntos sigue.
            _log.LogWarning(ex, "No se pudieron obtener los tokens FCM desde Auth.");
            return new List<UserFcmToken>();
        }
    }

    public async Task DeleteTokenAsync(string token, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Delete, $"api/internal/fcm-tokens/{token}");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? string.Empty);

        try { using var res = await _http.SendAsync(req, ct); }
        catch (Exception ex) { _log.LogWarning(ex, "No se pudo borrar el token FCM muerto."); }
    }
}
