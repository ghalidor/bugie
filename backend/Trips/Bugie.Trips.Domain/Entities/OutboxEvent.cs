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

    public long      Id          { get; set; }
    public string    EventType   { get; set; } = string.Empty;
    public string    PayloadJson { get; set; } = string.Empty;
    public string    Status      { get; set; } = "pending";
    public int       Attempts    { get; set; }
    public string?   LastError   { get; set; }
    public DateTime  CreatedAt   { get; set; }
    public DateTime? SentAt      { get; set; }

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
        decimal amount, string paymentMethod, DateTime completedAt) => new()
    {
        EventType   = TypeTripCompleted,
        PayloadJson = JsonSerializer.Serialize(new TripCompletedPayload(
            tripId, passengerId, driverId, amount, paymentMethod ?? string.Empty,
            completedAt)),
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

public record TripCompletedPayload(
    Guid     TripId,
    Guid     PassengerId,
    Guid?    DriverId,
    decimal  Amount,
    string   PaymentMethod,
    /// <summary>Hora de finalización en UTC. La usan las promociones.</summary>
    DateTime CompletedAt);
