using Bugie.Payments.Domain.Entities;

namespace Bugie.Payments.Domain.Interfaces;

public interface IWalletRepository
{
    Task<DriverWallet?> GetByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task                AddAsync(DriverWallet wallet, CancellationToken ct = default);
    Task                UpdateAsync(DriverWallet wallet, CancellationToken ct = default);
}
