namespace Bugie.Trips.Domain.Enums;

public enum TripStatus {
    Pending = 1,
    Negotiating = 7,  // Conductor propuso tarifa, esperando respuesta del pasajero
    Accepted = 2,
    InProgress = 3,
    Completed = 4,
    Cancelled = 5,
    SosActive = 6,
}
