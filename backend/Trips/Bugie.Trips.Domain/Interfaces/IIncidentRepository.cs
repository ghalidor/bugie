using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

public interface IIncidentRepository
{
    Task<Incident?> GetByTripAndRoleAsync(Guid tripId, string role, CancellationToken ct = default);
    Task<List<Incident>> GetByTripAsync(Guid tripId, CancellationToken ct = default);
    Task<Dictionary<Guid, int>> CountByTripIdsAsync(IEnumerable<Guid> tripIds, CancellationToken ct = default);
    Task AddAsync(Incident incident, CancellationToken ct = default);
}