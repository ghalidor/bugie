namespace Bugie.Trips.Domain.External;

/// <summary>
/// Puerto hacia el modulo de puntos. Trips no sabe como viaja el evento
/// (hoy HTTP, manana RabbitMQ): solo conoce esta interfaz.
/// </summary>
public interface IRewardsClient
{
    /// <summary>
    /// Entrega un evento ya serializado. Devuelve true si el destino lo acepto.
    /// No lanza excepciones por fallos de red: devuelve false.
    /// </summary>
    Task<bool> SendAsync(string eventType, string payloadJson, CancellationToken ct = default);
}
