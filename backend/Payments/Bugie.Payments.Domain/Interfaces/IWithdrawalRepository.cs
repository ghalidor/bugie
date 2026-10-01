using Bugie.Payments.Domain.Entities;

namespace Bugie.Payments.Domain.Interfaces;

public interface IWithdrawalRepository
{
    Task<List<Withdrawal>> GetByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task                   AddAsync(Withdrawal w, CancellationToken ct = default);
    Task                   UpdateAsync(Withdrawal w, CancellationToken ct = default);
}
