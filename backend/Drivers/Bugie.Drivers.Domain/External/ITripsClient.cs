namespace Bugie.Drivers.Domain.External;

/// <summary>
/// Cliente HTTP a Trips.Api. Reemplaza los JOIN cross-database hacia BugieTrips.trips.Trips.
/// Interfaz en Domain (contrato) — implementación en Infrastructure.
/// </summary>
public interface ITripsClient
{
    Task<HashSet<Guid>> GetDriversWithActiveTripAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default);

    /// <summary>
    /// True si el pasajero tiene ahora un viaje activo (aceptado, en curso o
    /// SOS) con ese conductor (UserId). Pregunta a Trips con X-Internal-Token.
    /// Si Trips no responde devuelve false (se niega el acceso).
    /// </summary>
    Task<bool> HasActiveTripWithAsync(
        Guid passengerId, Guid driverUserId, CancellationToken ct = default);
}
