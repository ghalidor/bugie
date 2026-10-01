namespace Bugie.Auth.Domain.External;

/// <summary>
/// Cliente que consulta settings de la plataforma desde Landing.Api.
/// Usado por las plantillas de correo para obtener la ciudad configurada.
/// </summary>
public interface ILandingSettingsClient
{
    /// <summary>
    /// Devuelve la ciudad principal de operación (ej. "Trujillo").
    /// Si Landing está caído o no responde, devuelve "Trujillo" como fallback.
    /// </summary>
    Task<string> GetDefaultCityAsync(CancellationToken ct = default);
}