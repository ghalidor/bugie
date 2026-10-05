namespace Bugie.Auth.Domain.Interfaces;

/// <summary>
/// Lo que impide eliminar una cuenta. Lee trips.trips y payments.driverwallet
/// (misma base de datos, como ya hacen Payments y Rewards con otros esquemas).
/// </summary>
public interface IAccountActivityReader
{
    /// <summary>
    /// Viaje o envío del usuario (como pasajero o conductor) que no terminó:
    /// pendiente, en negociación, aceptado, en curso o con SOS activo
    /// (incluye los programados que siguen pendientes). Null si no hay.
    /// </summary>
    Task<OpenTripInfo?> GetOpenTripAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Comisión que el conductor le debe a Bugie (0 si no debe).</summary>
    Task<decimal> GetDriverPendingCommissionAsync(Guid driverUserId, CancellationToken ct = default);
}

/// <param name="Status">TripStatus de Trips (1 pendiente, 2 aceptado, 3 en curso, 6 SOS, 7 negociando).</param>
/// <param name="ServiceType">0 viaje, 1 envío.</param>
/// <param name="ScheduledAt">UTC si es programado.</param>
public record OpenTripInfo(Guid Id, short Status, short ServiceType, DateTime? ScheduledAt);
