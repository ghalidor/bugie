using System.Data;
using Dapper;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Repositories;

/// <summary>
/// Lee trips.trips y payments.driverwallet (misma base de datos, solo lectura),
/// igual que Payments lee trips.trips y Rewards lee auth.users.
/// En ambas tablas DriverId / PassengerId son Ids de usuario (auth.users).
/// </summary>
public class AccountActivityReader : IAccountActivityReader
{
    private readonly IDbConnection _db;
    public AccountActivityReader(IDbConnection db) => _db = db;

    // TripStatus (Trips): 1 Pending, 2 Accepted, 3 InProgress, 6 SosActive, 7 Negotiating.
    // 4 Completed y 5 Cancelled ya terminaron.
    public Task<OpenTripInfo?> GetOpenTripAsync(Guid userId, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<OpenTripInfo>(@"
            SELECT Id, Status, ServiceType, ScheduledAt
            FROM trips.Trips
            WHERE (PassengerId = @Id OR DriverId = @Id)
              AND Status IN (1, 2, 3, 6, 7)
            ORDER BY (Status IN (3, 6)) DESC, CreatedAt DESC
            LIMIT 1",
            new { Id = userId });

    // Balance = comision pagada - comision generada. Negativo = deuda con Bugie.
    public async Task<decimal> GetDriverPendingCommissionAsync(Guid driverUserId, CancellationToken ct = default)
    {
        var balance = await _db.ExecuteScalarAsync<decimal?>(
            "SELECT Balance FROM payments.DriverWallet WHERE DriverId = @Id",
            new { Id = driverUserId });
        return balance is < 0 ? -balance.Value : 0m;
    }
}
