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

    /// <summary>
    /// Pregunta si un cupon sirve para este viaje y cuanto descuenta.
    /// Devuelve null si Rewards no responde: ahi no se aplica nada y se le
    /// pide al pasajero que reintente.
    /// </summary>
    Task<CouponValidation?> ValidateCouponAsync(
        string code, Guid userId, decimal fare, decimal platformFee,
        CancellationToken ct = default);

    /// <summary>Consume el cupon al completar el viaje.</summary>
    Task<bool> UseCouponAsync(string code, Guid tripId, CancellationToken ct = default);
}

/// <summary>Respuesta de Rewards al validar un cupon.</summary>
public record CouponValidation(
    bool     Valid,
    string?  Code,
    string?  ItemName,
    string?  RewardType,
    decimal  DiscountAmount,
    decimal  FullDiscount,
    decimal  OwedToDriver,
    string?  Reason,
    string?  Warning);
