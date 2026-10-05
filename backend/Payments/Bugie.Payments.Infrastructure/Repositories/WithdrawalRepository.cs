using System.Data;
using System.Text;
using Dapper;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Infrastructure.Repositories;

public class WithdrawalRepository : IWithdrawalRepository
{
    private readonly IDbConnection _db;
    public WithdrawalRepository(IDbConnection db) => _db = db;

    public Task AddAsync(Withdrawal w, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO payments.Withdrawals
                (Id, DriverId, DriverName, Amount, Method, AccountRef, OperationNumber,
                 Status, PaidAt, PaidByAdminId, PaidByAdminName, Note,
                 SourceType, SourceRef, ProcessedAt, CreatedAt)
            VALUES
                (@Id, @DriverId, @DriverName, @Amount, @Method, @AccountRef, @OperationNumber,
                 @Status, @PaidAt, @PaidByAdminId, @PaidByAdminName, @Note,
                 @SourceType, @SourceRef, @ProcessedAt, @CreatedAt)", w);

    public Task<bool> ExistsBySourceAsync(string sourceType, string sourceRef, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<bool>(@"
            SELECT EXISTS (SELECT 1 FROM payments.Withdrawals
                           WHERE SourceType = @SourceType AND SourceRef = @SourceRef)",
            new { SourceType = sourceType, SourceRef = sourceRef });

    public Task<Withdrawal?> GetBySourceAsync(string sourceType, IEnumerable<string> sourceRefs, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<Withdrawal>(@"
            SELECT * FROM payments.Withdrawals
            WHERE SourceType = @SourceType AND SourceRef = ANY(@Refs)
            ORDER BY CreatedAt
            LIMIT 1",
            new { SourceType = sourceType, Refs = sourceRefs.Distinct().ToArray() });

    public async Task<string> NextReceiptCodeAsync(int year, CancellationToken ct = default)
    {
        // Secuencia creada en scripts/2026-10-03_cobros_ranking.sql
        var n = await _db.ExecuteScalarAsync<long>("SELECT nextval('payments.payout_receipt_seq')");
        return $"PAG-{year}-{n:000000}";
    }

    public async Task<(List<Withdrawal> Items, int Total)> GetPagedAsync(
        PayoutFilter filter, int page, int pageSize, CancellationToken ct = default)
    {
        var (where, args) = BuildWhere(filter);
        args.Add("Take", pageSize);
        args.Add("Skip", (page - 1) * pageSize);

        var total = await _db.ExecuteScalarAsync<int>(
            $"SELECT COUNT(*)::int FROM payments.Withdrawals {where}", args);

        var rows = await _db.QueryAsync<Withdrawal>($@"
            SELECT * FROM payments.Withdrawals {where}
            ORDER BY COALESCE(PaidAt, CreatedAt) DESC
            LIMIT @Take OFFSET @Skip", args);

        return (rows.ToList(), total);
    }

    public async Task<List<PayoutMethodTotal>> GetTotalsAsync(PayoutFilter filter, CancellationToken ct = default)
    {
        var (where, args) = BuildWhere(filter);
        var rows = await _db.QueryAsync<PayoutMethodTotal>($@"
            SELECT Method, COUNT(*)::int AS Count, COALESCE(SUM(Amount), 0) AS Amount
            FROM payments.Withdrawals {where}
            GROUP BY Method
            ORDER BY Method", args);
        return rows.ToList();
    }

    /// <summary>Solo pagos ya hechos (status completed) mas los filtros.</summary>
    private static (string Where, DynamicParameters Args) BuildWhere(PayoutFilter f)
    {
        var sb   = new StringBuilder("WHERE Status = 'completed'");
        var args = new DynamicParameters();

        if (f.DriverId is not null)  { sb.Append(" AND DriverId = @DriverId");     args.Add("DriverId", f.DriverId); }
        if (f.FromUtc is not null)   { sb.Append(" AND PaidAt >= @From");          args.Add("From", f.FromUtc); }
        if (f.ToUtc is not null)     { sb.Append(" AND PaidAt <  @To");            args.Add("To", f.ToUtc); }
        if (!string.IsNullOrWhiteSpace(f.Method))     { sb.Append(" AND Method = @Method");         args.Add("Method", f.Method); }
        if (!string.IsNullOrWhiteSpace(f.SourceType)) { sb.Append(" AND SourceType = @SourceType"); args.Add("SourceType", f.SourceType); }
        if (!string.IsNullOrWhiteSpace(f.Search))
        {
            sb.Append(" AND (DriverName ILIKE @Search OR OperationNumber ILIKE @Search OR SourceRef ILIKE @Search)");
            args.Add("Search", $"%{f.Search.Trim()}%");
        }
        return (sb.ToString(), args);
    }
}
