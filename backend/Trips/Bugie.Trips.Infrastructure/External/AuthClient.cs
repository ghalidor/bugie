using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Infrastructure.External;

public class AuthClient : IAuthClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpContext;
    private readonly IConfiguration _cfg;

    public AuthClient(HttpClient http, IHttpContextAccessor httpContext, IConfiguration cfg)
    {
        _http = http;
        _httpContext = httpContext;
        _cfg = cfg;
    }

    public async Task<Dictionary<Guid, UserInfoDto>> GetUsersByIdsAsync(
        IEnumerable<Guid> ids, CancellationToken ct = default)
    {
        var idList = ids?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new Dictionary<Guid, UserInfoDto>();

        var query = string.Join("&", idList.Select(id => $"ids={id}"));
        using var req = new HttpRequestMessage(HttpMethod.Get, $"api/auth/users/bulk?{query}");

        var token = _httpContext.HttpContext?.Request.Headers["Authorization"].ToString();
        if(!string.IsNullOrEmpty(token)) req.Headers.Add("Authorization", token);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode) return new Dictionary<Guid, UserInfoDto>();
            var users = await res.Content.ReadFromJsonAsync<List<UserInfoDto>>(cancellationToken: ct);
            return users?.ToDictionary(u => u.Id) ?? new Dictionary<Guid, UserInfoDto>();
        }
        catch
        {
            return new Dictionary<Guid, UserInfoDto>();
        }
    }

    public async Task<List<FcmTokenInfo>> GetFcmTokensAsync(
        IEnumerable<Guid> userIds, CancellationToken ct = default)
    {
        var idList = userIds?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new List<FcmTokenInfo>();

        var query = string.Join("&", idList.Select(id => $"ids={id}"));
        using var req = new HttpRequestMessage(
            HttpMethod.Get, $"api/internal/fcm-tokens/by-users?{query}");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode) return new List<FcmTokenInfo>();
            var tokens = await res.Content.ReadFromJsonAsync<List<FcmTokenInfo>>(cancellationToken: ct);
            return tokens ?? new List<FcmTokenInfo>();
        }
        catch
        {
            return new List<FcmTokenInfo>();
        }
    }

    public async Task DeleteFcmTokenAsync(string token, CancellationToken ct = default)
    {
        if(string.IsNullOrEmpty(token)) return;
        using var req = new HttpRequestMessage(
            HttpMethod.Delete, $"api/internal/fcm-tokens/{Uri.EscapeDataString(token)}");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");

        try
        {
            using var res = await _http.SendAsync(req, ct);
            // No nos importa el resultado: si falla, lo reintentaremos en el
            // próximo push fallido.
        }
        catch { /* Idempotente, ignoramos errores. */ }
    }
}
