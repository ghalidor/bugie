using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Bugie.Drivers.Domain.External;

namespace Bugie.Drivers.Infrastructure.External;

public class TripsClient : ITripsClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpContext;

    public TripsClient(HttpClient http, IHttpContextAccessor httpContext)
    {
        _http = http;
        _httpContext = httpContext;
    }

    public async Task<HashSet<Guid>> GetDriversWithActiveTripAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default)
    {
        var idList = driverUserIds?.Distinct().ToList() ?? new List<Guid>();
        if (idList.Count == 0) return new HashSet<Guid>();

        var query = string.Join("&", idList.Select(id => $"ids={id}"));
        using var req = new HttpRequestMessage(HttpMethod.Get, $"api/trips/active-drivers?{query}");

        var token = _httpContext.HttpContext?.Request.Headers["Authorization"].ToString();
        if (!string.IsNullOrEmpty(token)) req.Headers.Add("Authorization", token);

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return new HashSet<Guid>();
            var ids = await res.Content.ReadFromJsonAsync<List<Guid>>(cancellationToken: ct);
            return ids?.ToHashSet() ?? new HashSet<Guid>();
        }
        catch
        {
            return new HashSet<Guid>();
        }
    }
}
