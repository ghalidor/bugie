using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

public interface ITripPhotoRepository
{
    Task AddAsync(TripPhoto photo, CancellationToken ct = default);
    Task<List<TripPhoto>> GetByTripAsync(Guid tripId, CancellationToken ct = default);
}
