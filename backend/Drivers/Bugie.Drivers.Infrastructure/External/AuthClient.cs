using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Bugie.Drivers.Domain.External;

namespace Bugie.Drivers.Infrastructure.External;

public class AuthClient : IAuthClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpContext;
    private readonly IConfiguration _cfg;

    // Auth devuelve las fechas en hora de Peru sin zona: se leen como UTC (ver BugieTime).
    private static readonly System.Text.Json.JsonSerializerOptions Json =
        new(System.Text.Json.JsonSerializerDefaults.Web) { Converters = { new Bugie.Drivers.Infrastructure.Time.PeruDateTimeJsonConverter() } };

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
        if (idList.Count == 0) return new Dictionary<Guid, UserInfoDto>();

        var query = string.Join("&", idList.Select(id => $"ids={id}"));
        // Endpoint interno de Auth (X-Internal-Token). El documento solo se pide
        // si quien consulta en Drivers es admin (igual que antes con el JWT).
        var includeDocument = _httpContext.HttpContext?.User?.IsInRole("admin") == true;
        using var req = new HttpRequestMessage(HttpMethod.Get,
            $"api/internal/users/bulk?{query}&includeDocument={(includeDocument ? "true" : "false")}");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? string.Empty);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return new Dictionary<Guid, UserInfoDto>();
            var users = await res.Content.ReadFromJsonAsync<List<UserInfoDto>>(Json, ct);
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
