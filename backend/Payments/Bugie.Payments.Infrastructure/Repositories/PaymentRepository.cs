using System.Data;
using Dapper;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Infrastructure.Repositories;

public class PaymentRepository : IPaymentRepository {
    private readonly IDbConnection _db;
    public PaymentRepository(IDbConnection db) => _db = db;

    public Task<Payment?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Payment>(
            "SELECT * FROM payments.Payments WHERE Id = @Id", new { Id = id });

    public Task<Payment?> GetByTripIdAsync(Guid tripId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Payment>(
            "SELECT * FROM payments.Payments WHERE TripId = @TripId", new { TripId = tripId });

    public async Task<List<Payment>> GetByDriverAsync(Guid driverId, CancellationToken ct = default) {
        var rows = await _db.QueryAsync<Payment>(
            "SELECT * FROM payments.Payments WHERE DriverId = @Id ORDER BY CreatedAt DESC",
            new { Id = driverId });
        return rows.ToList();
    }

    public async Task<List<Payment>> GetByPassengerAsync(Guid passengerId, CancellationToken ct = default) {
        var rows = await _db.QueryAsync<Payment>(
            "SELECT * FROM payments.Payments WHERE PassengerId = @Id ORDER BY CreatedAt DESC",
            new { Id = passengerId });
        return rows.ToList();
    }

    public async Task<List<Payment>> GetAllAsync(string? status, CancellationToken ct = default) {
        var sql = status is null
            ? "SELECT * FROM payments.Payments ORDER BY CreatedAt DESC"
            : "SELECT * FROM payments.Payments WHERE Status = @Status ORDER BY CreatedAt DESC";

        var rows = await _db.QueryAsync<Payment>(sql,
            status is null ? null : new { Status = status });
        return rows.ToList();
    }

    public Task AddAsync(Payment payment, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO payments.Payments
                (Id, TripId, PassengerId, DriverId, Amount, PlatformFee,
                 PlatformFeeRate, DriverAmount, Method, Status, Reference,
                 CreatedAt, PaidAt)
            VALUES
                (@Id, @TripId, @PassengerId, @DriverId, @Amount, @PlatformFee,
                 @PlatformFeeRate, @DriverAmount, @Method, @Status, @Reference,
                 @CreatedAt, @PaidAt)",
            payment);

    public Task UpdateAsync(Payment payment, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE payments.Payments SET
                Status = @Status, Reference = @Reference, PaidAt = @PaidAt
            WHERE Id = @Id",
            payment);

    public async Task<(List<Payment> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string? status,
        CancellationToken ct = default) {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        var where = string.IsNullOrWhiteSpace(status) ? "" : "WHERE Status = @Status";
        var p = new DynamicParameters();
        if(!string.IsNullOrWhiteSpace(status)) p.Add("Status", status);
        p.Add("Skip", skip);
        p.Add("Take", pageSize);

        var dataSql = $@"
            SELECT * FROM payments.Payments
            {where}
            ORDER BY CreatedAt DESC
            LIMIT @Take OFFSET @Skip";
        var countSql = $"SELECT COUNT(*) FROM payments.Payments {where}";

        var items = (await _db.QueryAsync<Payment>(dataSql, p)).ToList();
        var total = await _db.ExecuteScalarAsync<int>(countSql, p);
        return (items, total);
    }

    public async Task<(decimal TotalAmount, decimal TotalFee, decimal TotalDriver, int PendingCount, int CompletedCount)>
        GetStatsAsync(string? status, CancellationToken ct = default) {
        // Si el admin filtra por estado, los KPIs reflejan ese filtro.
        // Si no filtra, son globales (todos los pagos).
        var where = string.IsNullOrWhiteSpace(status) ? "" : "WHERE Status = @Status";
        var p = new DynamicParameters();
        if(!string.IsNullOrWhiteSpace(status)) p.Add("Status", status);

        // Los totales monetarios se basan en pagos COMPLETED (los efectivos).
        // Aunque el admin filtre el listado por 'pending', los KPIs monetarios
        // siguen sumando completados — porque eso es lo que importa para
        // "Total recaudado". Solo "Pendientes" cuenta filas.
        var sql = $@"
            SELECT
                COALESCE(SUM(CASE WHEN Status = 'completed' THEN Amount       ELSE 0 END), 0) AS TotalAmount,
                COALESCE(SUM(CASE WHEN Status = 'completed' THEN PlatformFee  ELSE 0 END), 0) AS TotalFee,
                COALESCE(SUM(CASE WHEN Status = 'completed' THEN DriverAmount ELSE 0 END), 0) AS TotalDriver,
                SUM(CASE WHEN Status = 'pending'   THEN 1 ELSE 0 END)                       AS PendingCount,
                SUM(CASE WHEN Status = 'completed' THEN 1 ELSE 0 END)                       AS CompletedCount
            FROM payments.Payments
            {where}";

        var row = await _db.QuerySingleAsync<PaymentStatsRow>(sql, p);
        return (row.TotalAmount, row.TotalFee, row.TotalDriver, row.PendingCount, row.CompletedCount);
    }

    private class PaymentStatsRow {
        public decimal TotalAmount { get; set; }
        public decimal TotalFee { get; set; }
        public decimal TotalDriver { get; set; }
        public int PendingCount { get; set; }
        public int CompletedCount { get; set; }
    }
}
