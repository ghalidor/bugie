namespace Bugie.Auth.Domain.External;

/// <summary>
/// Cliente que consulta settings de la plataforma desde Landing.Api.
/// Usado por las plantillas de correo para obtener la ciudad configurada.
/// </summary>
public interface ILandingSettingsClient
{
    /// <summary>
    /// Devuelve la ciudad principal de operación (setting default_city).
    /// Si Landing está caído, devuelve la última ciudad conocida o "tu ciudad".
    /// </summary>
    Task<string> GetDefaultCityAsync(CancellationToken ct = default);
}