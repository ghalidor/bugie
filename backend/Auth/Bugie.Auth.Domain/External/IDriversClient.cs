namespace Bugie.Auth.Domain.External;

/// <summary>
/// Cliente HTTP que llama a la API de Drivers desde Auth.
/// Usado al registrar un usuario con rol 'driver' para crear su perfil
/// automáticamente en el módulo Drivers.
/// </summary>
public interface IDriversClient
{
    /// <summary>
    /// Crea el perfil de conductor para un usuario recién registrado.
    /// Devuelve true si se creó correctamente, false si hubo error.
    /// </summary>
    Task<bool> RegisterDriverAsync(Guid userId, CancellationToken ct = default);
}