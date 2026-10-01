using System.Net.Http.Json;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Infrastructure.External;

/// <summary>
/// Implementación HTTP de ILandingClient. Llama al endpoint público
/// `GET /api/landing/settings` (no requiere auth) y busca la key que
/// se le pida.
/// </summary>
public class LandingClient : ILandingClient
{
    private readonly HttpClient _http;

    public LandingClient(HttpClient http) => _http = http;

    // DTO interno que matchea con SystemSetting de Landing (solo los
    // campos que nos importan).
    private record SettingDto(string SettingKey, string Value);

    public async Task<int> GetMaxRadiusMetersAsync(int fallbackMeters, CancellationToken ct = default)
    {
        try
        {
            // Pedimos toda la lista; el endpoint es liviano (< 20 settings).
            var list = await _http.GetFromJsonAsync<List<SettingDto>>(
                "api/landing/settings", ct);
            if(list is null) return fallbackMeters;

            var setting = list.FirstOrDefault(s =>
                string.Equals(s.SettingKey, "max_radius_km", StringComparison.OrdinalIgnoreCase));
            if(setting is null) return fallbackMeters;

            // El admin guarda km, nosotros usamos metros internamente.
            if(double.TryParse(setting.Value, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var km))
            {
                if(km <= 0) return fallbackMeters;
                return (int)(km * 1000);
            }
            return fallbackMeters;
        }
        catch(Exception e)
        {
            // Cualquier error de red/parsing → caemos al fallback para
            // no dejar a los conductores sin recibir viajes.
            Console.WriteLine($"LandingClient.GetMaxRadiusMetersAsync error: {e.Message}");
            return fallbackMeters;
        }
    }
}
