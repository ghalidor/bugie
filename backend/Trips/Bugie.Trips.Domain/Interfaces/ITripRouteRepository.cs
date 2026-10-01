using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

public interface ITripRouteRepository
{
    Task                       AddAsync(TripRoutePoint point, CancellationToken ct = default);
    Task<List<TripRoutePoint>> GetByTripAsync(Guid tripId, CancellationToken ct = default);
}
