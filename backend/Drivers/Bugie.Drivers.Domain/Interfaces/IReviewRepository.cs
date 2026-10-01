using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

public interface IReviewRepository
{
    Task<List<Review>> GetByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task               AddAsync(Review review, CancellationToken ct = default);
    Task<bool>         ExistsForTripAsync(Guid tripId, CancellationToken ct = default);
}
