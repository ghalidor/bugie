using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface IPointsTransactionRepository
{
    Task<(List<PointsTransaction> Items, int Total)> GetByProfileAsync(
        Guid profileId, int page, int pageSize, CancellationToken ct = default);
}
