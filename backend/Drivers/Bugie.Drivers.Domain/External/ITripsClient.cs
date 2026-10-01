namespace Bugie.Drivers.Domain.External;

/// <summary>
/// Cliente HTTP a Trips.Api. Reemplaza los JOIN cross-database hacia BugieTrips.trips.Trips.
/// Interfaz en Domain (contrato) — implementación en Infrastructure.
/// </summary>
public interface ITripsClient
{
    Task<HashSet<Guid>> GetDriversWithActiveTripAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default);
}
