using System.Threading;
using System.Threading.Tasks;

namespace Bugie.Trips.Domain.External;

/// <summary>
/// Cliente HTTP al módulo Landing para leer los settings administrables
/// (radio de búsqueda, tarifas, etc) que el admin configura desde el
/// panel y se guardan en BD Landing.
/// </summary>
public interface ILandingClient
{
    /// <summary>
    /// Lee el setting `max_radius_km` de Landing y lo devuelve en METROS.
    /// Si falla la lectura (red, parsing, setting no existe), devuelve
    /// el fallback que se le pase (típicamente lo del appsettings.json).
    /// </summary>
    Task<int> GetMaxRadiusMetersAsync(int fallbackMeters, CancellationToken ct = default);

    /// <summary>
    /// Lee el valor de un setting por su key (ej. `deviation_threshold_m`).
    /// Usa un caché corto en memoria (30 s) porque se consulta en cada GPS.
    /// Devuelve null si no existe o falla la lectura.
    /// </summary>
    Task<string?> GetSettingAsync(string key, CancellationToken ct = default);
}
