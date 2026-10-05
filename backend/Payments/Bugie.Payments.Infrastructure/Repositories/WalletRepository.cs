using System.Data;
using Dapper;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Infrastructure.Repositories;

/// <summary>
/// Billetera del conductor. Cada cambio de saldo va en una transaccion que
/// bloquea la fila de la billetera (FOR UPDATE): asi dos viajes que terminan
/// a la vez no pisan el saldo, y el movimiento guarda el saldo correcto.
/// </summary>
public class WalletRepository : IWalletRepository
{
    private readonly IDbConnection _db;
    public WalletRepository(IDbConnection db) => _db = db;

    public Task<DriverWallet?> GetByDriverAsync(Guid driverId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<DriverWallet>(
            "SELECT * FROM payments.DriverWallet WHERE DriverId = @Id", new { Id = driverId });

    public async Task<bool> AddCommissionAsync(WalletTransaction tx, CancellationToken ct = default)
    {
        using var t = Begin();

        await LockWalletAsync(tx.DriverId, t);

        // Idempotente: ese viaje ya tiene su comision registrada
        var exists = await _db.ExecuteScalarAsync<bool>(@"
            SELECT EXISTS (SELECT 1 FROM payments.WalletTransactions
                           WHERE TripId = @TripId AND Type = 'comision')",
            new { tx.TripId }, t);
        if (exists) { t.Rollback(); return false; }

        // Ganancia neta = monto del viaje - comision
        var balance = await _db.ExecuteScalarAsync<decimal>(@"
            UPDATE payments.DriverWallet SET
                Balance         = Balance - @Fee,
                TotalCommission = TotalCommission + @Fee,
                TotalEarned     = TotalEarned + @Net,
                UpdatedAt       = @Now
            WHERE DriverId = @DriverId
            RETURNING Balance",
            new { Fee = tx.Amount, Net = (tx.TripAmount ?? 0) - tx.Amount, tx.DriverId, Now = DateTime.UtcNow }, t);

        tx.SetBalanceAfter(balance);
        tx.SetId(await InsertAsync(tx, t));
        t.Commit();
        return true;
    }

    public async Task AddCommissionPaymentAsync(WalletTransaction tx, CancellationToken ct = default)
    {
        using var t = Begin();

        await LockWalletAsync(tx.DriverId, t);

        var balance = await _db.ExecuteScalarAsync<decimal>(@"
            UPDATE payments.DriverWallet SET
                Balance             = Balance + @Amount,
                TotalCommissionPaid = TotalCommissionPaid + @Amount,
                UpdatedAt           = @Now
            WHERE DriverId = @DriverId
            RETURNING Balance",
            new { tx.Amount, tx.DriverId, Now = DateTime.UtcNow }, t);

        tx.SetBalanceAfter(balance);
        tx.SetId(await InsertAsync(tx, t));
        t.Commit();
    }

    public async Task<(List<WalletTransaction> Items, int Total)> GetTransactionsAsync(
        Guid driverId, int page, int pageSize, CancellationToken ct = default)
    {
        var total = await _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*)::int FROM payments.WalletTransactions WHERE DriverId = @DriverId",
            new { DriverId = driverId });

        var rows = await _db.QueryAsync<WalletTransaction>(@"
            SELECT * FROM payments.WalletTransactions
            WHERE DriverId = @DriverId
            ORDER BY CreatedAt DESC, Id DESC
            LIMIT @Take OFFSET @Skip",
            new { DriverId = driverId, Take = pageSize, Skip = (page - 1) * pageSize });

        return (rows.ToList(), total);
    }

    public async Task<(List<WalletWithName> Items, int Total, decimal TotalDebt, int DriversWithDebt)> GetWalletsAsync(
        string? search, bool onlyDebt, int page, int pageSize, CancellationToken ct = default)
    {
        var where = "WHERE 1 = 1";
        if (onlyDebt) where += " AND w.Balance < 0";
        if (!string.IsNullOrWhiteSpace(search)) where += " AND u.FullName ILIKE @Search";
        var args = new
        {
            Search = $"%{search?.Trim()}%",
            Take   = pageSize,
            Skip   = (page - 1) * pageSize,
        };

        var from = $@"FROM payments.DriverWallet w
                      LEFT JOIN auth.Users u ON u.Id = w.DriverId
                      {where}";

        var totals = await _db.QuerySingleAsync<WalletTotals>($@"
            SELECT COUNT(*)::int AS Total,
                   COALESCE(SUM(-w.Balance) FILTER (WHERE w.Balance < 0), 0) AS TotalDebt,
                   (COUNT(*) FILTER (WHERE w.Balance < 0))::int AS DriversWithDebt
            {from}", args);

        var rows = await _db.QueryAsync<WalletWithName>($@"
            SELECT w.DriverId, u.FullName AS DriverName, w.Balance, w.TotalEarned,
                   w.TotalCommission, w.TotalCommissionPaid, w.UpdatedAt
            {from}
            ORDER BY w.Balance ASC, u.FullName
            LIMIT @Take OFFSET @Skip", args);

        return (rows.ToList(), totals.Total, totals.TotalDebt, totals.DriversWithDebt);
    }

    public async Task<(List<CommissionPaymentRow> Items, int Total, decimal TotalAmount)> GetCommissionPaymentsAsync(
        Guid? driverId, int page, int pageSize, CancellationToken ct = default)
    {
        var where = "WHERE t.Type = 'pago_comision'" + (driverId is null ? "" : " AND t.DriverId = @DriverId");
        var args  = new { DriverId = driverId, Take = pageSize, Skip = (page - 1) * pageSize };

        var totals = await _db.QuerySingleAsync<PaymentTotals>($@"
            SELECT COUNT(*)::int AS Total, COALESCE(SUM(t.Amount), 0) AS TotalAmount
            FROM payments.WalletTransactions t {where}", args);

        var rows = await _db.QueryAsync<CommissionPaymentRow>($@"
            SELECT t.Id, t.DriverId, u.FullName AS DriverName, t.Amount, t.BalanceAfter,
                   t.Method, t.OperationNumber, t.Note, t.PaidAt, t.AdminName, t.CreatedAt
            FROM payments.WalletTransactions t
            LEFT JOIN auth.Users u ON u.Id = t.DriverId
            {where}
            ORDER BY COALESCE(t.PaidAt, t.CreatedAt) DESC, t.Id DESC
            LIMIT @Take OFFSET @Skip", args);

        return (rows.ToList(), totals.Total, totals.TotalAmount);
    }

    // -- Ayudantes --

    private sealed class WalletTotals  { public int Total { get; set; } public decimal TotalDebt { get; set; } public int DriversWithDebt { get; set; } }
    private sealed class PaymentTotals { public int Total { get; set; } public decimal TotalAmount { get; set; } }

    private IDbTransaction Begin()
    {
        if (_db.State != ConnectionState.Open) _db.Open();
        return _db.BeginTransaction();
    }

    /// <summary>Crea la billetera si no existe y bloquea su fila hasta el commit.</summary>
    private async Task LockWalletAsync(Guid driverId, IDbTransaction t)
    {
        await _db.ExecuteAsync(@"
            INSERT INTO payments.DriverWallet (DriverId) VALUES (@DriverId)
            ON CONFLICT (DriverId) DO NOTHING", new { DriverId = driverId }, t);
        await _db.ExecuteAsync(
            "SELECT 1 FROM payments.DriverWallet WHERE DriverId = @DriverId FOR UPDATE",
            new { DriverId = driverId }, t);
    }

    private Task<long> InsertAsync(WalletTransaction tx, IDbTransaction t) =>
        _db.ExecuteScalarAsync<long>(@"
            INSERT INTO payments.WalletTransactions
                (DriverId, Type, Amount, Reference, BalanceAfter, TripId, TripAmount,
                 Method, OperationNumber, Note, PaidAt, AdminId, AdminName, CreatedAt)
            VALUES
                (@DriverId, @Type, @Amount, @Reference, @BalanceAfter, @TripId, @TripAmount,
                 @Method, @OperationNumber, @Note, @PaidAt, @AdminId, @AdminName, @CreatedAt)
            RETURNING Id", tx, t);
}
