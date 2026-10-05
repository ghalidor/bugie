using System.Net.Http.Json;
using Bugie.Auth.Domain.External;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Auth.Infrastructure.External;

/// <summary>
/// Configuración del cliente. El secreto compartido protege el endpoint interno
/// para que solo Auth pueda crear conductores sin JWT de usuario.
/// </summary>
public class DriversClientOptions
{
    public string BaseUrl { get; set; } = "http://localhost:5003";
    public string InternalToken { get; set; } = string.Empty;
}

public class DriversClient : IDriversClient
{
    private readonly HttpClient _http;
    private readonly DriversClientOptions _opt;
    private readonly ILogger<DriversClient> _log;

    public DriversClient(HttpClient http, IOptions<DriversClientOptions> opt, ILogger<DriversClient> log)
    {
        _http = http;
        _opt = opt.Value;
        _log = log;

        if(_http.BaseAddress is null && !string.IsNullOrWhiteSpace(_opt.BaseUrl))
            _http.BaseAddress = new Uri(_opt.BaseUrl);
    }

    public async Task<bool> RegisterDriverAsync(Guid userId, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "api/drivers/internal/register");
            req.Headers.Add("X-Internal-Token", _opt.InternalToken);
            req.Content = JsonContent.Create(new { userId });

            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(ct);
                _log.LogError("Drivers /internal/register devolvió {Status}: {Body}", res.StatusCode, body);
                return false;
            }
            return true;
        }
        catch(Exception ex)
        {
            _log.LogError(ex, "Error llamando a Drivers /internal/register para userId {UserId}", userId);
            return false;
        }
    }

    public async Task<bool> NotifyAccountDeletedAsync(Guid userId, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "api/drivers/internal/account-deleted");
            req.Headers.Add("X-Internal-Token", _opt.InternalToken);
            req.Content = JsonContent.Create(new { userId });

            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(ct);
                _log.LogError("Drivers /internal/account-deleted devolvió {Status}: {Body}", res.StatusCode, body);
                return false;
            }
            return true;
        }
        catch(Exception ex)
        {
            _log.LogError(ex, "Error llamando a Drivers /internal/account-deleted para userId {UserId}", userId);
            return false;
        }
    }
}