namespace Bugie.Trips.Domain.External;

/// <summary>
/// Puerto hacia el modulo de puntos. Trips no sabe como viaja el evento
/// (hoy HTTP, manana RabbitMQ): solo conoce esta interfaz.
/// </summary>
public interface IRewardsClient
{
    /// <summary>
    /// Entrega un evento ya serializado (lo usa la bandeja de salida).
    /// No lanza excepciones por fallos de red: devuelve TransientFailure.
    /// </summary>
    Task<OutboxDelivery> SendAsync(string eventType, string payloadJson, CancellationToken ct = default);

    /// <summary>
    /// Pregunta si un cupon sirve para este viaje y cuanto descuenta.
    /// Devuelve null si Rewards no responde: ahi no se aplica nada y se le
    /// pide al pasajero que reintente.
    /// </summary>
    Task<CouponValidation?> ValidateCouponAsync(
        string code, Guid userId, decimal fare,
        CancellationToken ct = default);

    /// <summary>
    /// Valida el cupon y lo RESERVA para este viaje (nadie mas lo puede usar
    /// hasta que el viaje termine o se quite). Devuelve null si Rewards no
    /// responde: ahi no se aplica nada y el pasajero reintenta.
    /// </summary>
    Task<CouponValidation?> ReserveCouponAsync(
        string code, Guid userId, Guid tripId, decimal fare,
        CancellationToken ct = default);

    /// <summary>
    /// Libera la reserva del cupon en este viaje (se quito o se cancelo el
    /// viaje). requestedAtUtc: cuando se quito; una reserva posterior no se
    /// toca. True si Rewards respondio (haya o no liberado algo). No lanza.
    /// </summary>
    Task<bool> ReleaseCouponAsync(
        string code, Guid tripId, DateTime requestedAtUtc,
        CancellationToken ct = default);

    // El consumo del cupon al completar el viaje va por la bandeja de salida
    // (evento trip.coupon_used), para que no se pierda si Rewards no responde.
}

/// <summary>Resultado de entregar un evento de la bandeja de salida.</summary>
public enum OutboxDelivery
{
    /// <summary>El destino lo acepto.</summary>
    Sent,
    /// <summary>Sin respuesta, error de red o 5xx: reintentar mas tarde.</summary>
    TransientFailure,
    /// <summary>El destino lo rechazo (4xx) o el tipo no existe: no tiene arreglo reintentando.</summary>
    Rejected,
}

/// <summary>Respuesta de Rewards al validar un cupon.</summary>
public record CouponValidation(
    bool     Valid,
    string?  Code,
    string?  ItemName,
    string?  RewardType,
    decimal  DiscountAmount,
    decimal  FullDiscount,
    string?  Reason,
    string?  Warning,
    // Cupon de monto que vale mas que la tarifa: soles que sobran y su valor en
    // puntos (tasa del pasajero). 0 si no sobra nada.
    decimal  LeftoverSoles  = 0,
    int      LeftoverPoints = 0);
