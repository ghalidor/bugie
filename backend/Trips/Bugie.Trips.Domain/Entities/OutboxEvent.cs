using System.Text.Json;

namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Evento pendiente de enviar a otro modulo.
///
/// Trips escribe aqui cuando pasa algo que a otros modulos les interesa.
/// Un background service lo entrega y lo marca como enviado.
/// Si el destino esta caido, la fila se queda y se reintenta: Trips nunca
/// falla por culpa de otro modulo.
/// </summary>
public class OutboxEvent
{
    public const string TypeTripCompleted = "trip.completed";
    public const string TypeTripRated     = "trip.rated";
    public const string TypeCouponUsed     = "trip.coupon_used";
    public const string TypeCouponReleased = "trip.coupon_released";

    public long      Id          { get; set; }
    public string    EventType   { get; set; } = string.Empty;
    public string    PayloadJson { get; set; } = string.Empty;
    public string    Status      { get; set; } = "pending";
    public int       Attempts    { get; set; }
    public string?   LastError   { get; set; }
    public DateTime  CreatedAt   { get; set; }
    public DateTime? SentAt      { get; set; }
    /// <summary>Próximo intento (espera creciente entre reintentos). Null = ya.</summary>
    public DateTime? NextAttemptAt { get; set; }

    /// <summary>
    /// Viaje completado con cupón: Rewards consume la reserva y devuelve el
    /// sobrante en puntos. Por la bandeja para que no se pierda si Rewards no
    /// responde (Rewards es idempotente por viaje).
    /// </summary>
    public static OutboxEvent CouponUsed(Guid tripId, string code, decimal appliedDiscount) => new()
    {
        EventType   = TypeCouponUsed,
        PayloadJson = JsonSerializer.Serialize(new CouponUsedPayload(code, tripId, appliedDiscount)),
        Status      = "pending",
        Attempts    = 0,
        CreatedAt   = DateTime.UtcNow,
    };

    /// <summary>
    /// Se quitó el cupón o se canceló el viaje y Rewards no respondió al
    /// momento: la reserva se libera cuando vuelva.
    /// </summary>
    public static OutboxEvent CouponReleased(Guid tripId, string code, DateTime requestedAtUtc) => new()
    {
        EventType   = TypeCouponReleased,
        PayloadJson = JsonSerializer.Serialize(new CouponReleasedPayload(code, tripId, requestedAtUtc)),
        Status      = "pending",
        Attempts    = 0,
        CreatedAt   = DateTime.UtcNow,
    };

    /// <summary>
    /// Calificación registrada. Usa la misma bandeja que el viaje completado,
    /// así hereda el reintento y la protección contra duplicados.
    /// </summary>
    public static OutboxEvent TripRated(
        Guid tripId, Guid passengerId, Guid driverId, byte stars) => new()
    {
        EventType   = TypeTripRated,
        PayloadJson = JsonSerializer.Serialize(new TripRatedPayload(
            tripId, passengerId, driverId, stars)),
        Status      = "pending",
        Attempts    = 0,
        CreatedAt   = DateTime.UtcNow,
    };

    public static OutboxEvent TripCompleted(
        Guid tripId, Guid passengerId, Guid? driverId,
        decimal amount, string paymentMethod, DateTime completedAt,
        decimal? baseAmount = null) => new()
    {
        EventType   = TypeTripCompleted,
        PayloadJson = JsonSerializer.Serialize(new TripCompletedPayload(
            tripId, passengerId, driverId, amount, paymentMethod ?? string.Empty,
            completedAt, baseAmount ?? amount)),
        Status      = "pending",
        Attempts    = 0,
        CreatedAt   = DateTime.UtcNow,
    };
}

/// <summary>
/// El pasajero calificó al conductor. Rewards decide a quién le toca puntos
/// según su configuración: al que califica, al calificado, o a los dos.
/// </summary>
public record TripRatedPayload(
    Guid TripId,
    Guid PassengerId,
    Guid DriverId,
    byte Stars);

/// <param name="AppliedDiscount">Lo que de verdad se descontó de la tarifa.</param>
public record CouponUsedPayload(string Code, Guid TripId, decimal AppliedDiscount);

/// <param name="RequestedAt">Cuándo se quitó (UTC): una reserva posterior no se libera.</param>
public record CouponReleasedPayload(string Code, Guid TripId, DateTime RequestedAt);

public record TripCompletedPayload(
    Guid     TripId,
    Guid     PassengerId,
    Guid?    DriverId,
    decimal  Amount,
    string   PaymentMethod,
    /// <summary>Hora de finalización en UTC. La usan las promociones.</summary>
    DateTime CompletedAt,
    /// <summary>
    /// Tarifa acordada antes del cupón. Amount es lo que pagó el pasajero; el
    /// conductor gana sus puntos sobre esta tarifa (el descuento lo asume Bugie).
    /// Sin cupón es igual a Amount.
    /// </summary>
    decimal  BaseAmount);
