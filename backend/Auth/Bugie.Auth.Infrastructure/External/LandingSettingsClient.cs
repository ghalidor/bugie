using System.Net.Http.Json;
using Bugie.Auth.Domain.External;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Auth.Infrastructure.External;

public class LandingSettingsClientOptions
{
    public string BaseUrl { get; set; } = "http://localhost:5005";

    /// <summary>Tiempo de cache en minutos. Por defecto 10.</summary>
    public int CacheMinutes { get; set; } = 10;
}

/// <summary>
/// Cliente HTTP a Landing.Api con cache en memoria.
/// Evita hacer una llamada HTTP por cada correo que se manda.
/// </summary>
public class LandingSettingsClient : ILandingSettingsClient
{
    private readonly HttpClient _http;
    private readonly LandingSettingsClientOptions _opt;
    private readonly ILogger<LandingSettingsClient> _log;

    // Cache simple
    private static string? _cachedCity;
    private static DateTime _cachedAt = DateTime.MinValue;
    private static readonly SemaphoreSlim _lock = new(1, 1);

    // Sin ciudad configurada (o Landing caído sin nada en caché): texto neutro,
    // igual que la web ("tu ciudad"), en vez de una ciudad fija.
    private const string DefaultFallback = "tu ciudad";

    public LandingSettingsClient(
        HttpClient http,
        IOptions<LandingSettingsClientOptions> opt,
        ILogger<LandingSettingsClient> log)
    {
        _http = http;
        _opt = opt.Value;
        _log = log;

        if(_http.BaseAddress is null && !string.IsNullOrWhiteSpace(_opt.BaseUrl))
            _http.BaseAddress = new Uri(_opt.BaseUrl);
    }

    public async Task<string> GetDefaultCityAsync(CancellationToken ct = default)
    {
        // Cache válido → devolver directo
        var age = DateTime.UtcNow - _cachedAt;
        if(_cachedCity is not null && age.TotalMinutes < _opt.CacheMinutes)
            return _cachedCity;

        // Refrescar cache (evitando que múltiples requests refresquen a la vez)
        await _lock.WaitAsync(ct);
        try
        {
            // Re-check: otro thread pudo haberlo refrescado
            age = DateTime.UtcNow - _cachedAt;
            if(_cachedCity is not null && age.TotalMinutes < _opt.CacheMinutes)
                return _cachedCity;

            try
            {
                using var res = await _http.GetAsync("api/landing/settings/default_city", ct);
                if(res.IsSuccessStatusCode)
                {
                    var body = await res.Content.ReadFromJsonAsync<SettingResponse>(cancellationToken: ct);
                    if(body is not null && !string.IsNullOrWhiteSpace(body.Value))
                    {
                        _cachedCity = body.Value;
                        _cachedAt = DateTime.UtcNow;
                        return _cachedCity;
                    }
                }
                _log.LogWarning("Landing.Api devolvió {Status} al consultar default_city", res.StatusCode);
            }
            catch(Exception ex)
            {
                _log.LogError(ex, "Error consultando default_city a Landing.Api");
            }

            // Fallback si Landing está caído
            return _cachedCity ?? DefaultFallback;
        }
        finally
        {
            _lock.Release();
        }
    }

    private record SettingResponse(string SettingKey, string Value);
}