using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Bugie.Drivers.Domain.External;

namespace Bugie.Drivers.Infrastructure.External;

public class AuthClient : IAuthClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpContext;

    public AuthClient(HttpClient http, IHttpContextAccessor httpContext)
    {
        _http = http;
        _httpContext = httpContext;
    }

    public async Task<Dictionary<Guid, UserInfoDto>> GetUsersByIdsAsync(
        IEnumerable<Guid> ids, CancellationToken ct = default)
    {
        var idList = ids?.Distinct().ToList() ?? new List<Guid>();
        if (idList.Count == 0) return new Dictionary<Guid, UserInfoDto>();

        var query = string.Join("&", idList.Select(id => $"ids={id}"));
        using var req = new HttpRequestMessage(HttpMethod.Get, $"api/auth/users/bulk?{query}");

        // Reenviar el JWT del usuario actual
        var token = _httpContext.HttpContext?.Request.Headers["Authorization"].ToString();
        if (!string.IsNullOrEmpty(token)) req.Headers.Add("Authorization", token);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return new Dictionary<Guid, UserInfoDto>();
            var users = await res.Content.ReadFromJsonAsync<List<UserInfoDto>>(cancellationToken: ct);
            return users?.ToDictionary(u => u.Id) ?? new Dictionary<Guid, UserInfoDto>();
        }
        catch
        {
            // Si Auth.Api está caído, no rompemos: devolvemos vacío y los handlers
            // pondrán "Conductor" como fallback en el FullName.
            return new Dictionary<Guid, UserInfoDto>();
        }
    }
}
