using System.Data;
using Dapper;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Infrastructure.Repositories;

public class WalletRepository : IWalletRepository
{
    private readonly IDbConnection _db;
    public WalletRepository(IDbConnection db) => _db = db;

    public Task<DriverWallet?> GetByDriverAsync(Guid driverId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<DriverWallet>(
            "SELECT * FROM payments.DriverWallet WHERE DriverId = @Id", new { Id = driverId });

    public Task AddAsync(DriverWallet wallet, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO payments.DriverWallet
                (Id, DriverId, Balance, TotalEarned, TotalWithdrawn, UpdatedAt)
            VALUES
                (@Id, @DriverId, @Balance, @TotalEarned, @TotalWithdrawn, @UpdatedAt)",
            wallet);

    public Task UpdateAsync(DriverWallet wallet, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE payments.DriverWallet SET
                Balance = @Balance, TotalEarned = @TotalEarned,
                TotalWithdrawn = @TotalWithdrawn, UpdatedAt = @UpdatedAt
            WHERE Id = @Id",
            wallet);
}
