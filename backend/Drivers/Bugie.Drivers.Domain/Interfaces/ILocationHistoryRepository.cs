using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

public interface ILocationHistoryRepository
{
    Task                      AddAsync(LocationHistory point, CancellationToken ct = default);
    Task<List<LocationHistory>> GetByTripAsync(Guid tripId, CancellationToken ct = default);
}
