using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class ApprovalAuditRepository : IApprovalAuditRepository
{
    private readonly IDbConnection _db;
    public ApprovalAuditRepository(IDbConnection db) => _db = db;

    public Task AddAsync(ApprovalAudit audit, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO drivers.ApprovalAudit
                (Id, DriverId, Action, AdminUserId, AdminName, Reason, MissingDocs, Deadline,
                 FromStatus, ToStatus, ActorRole, CreatedAt)
            VALUES
                (@Id, @DriverId, @Action, @AdminUserId, @AdminName, @Reason, @MissingDocs, @Deadline,
                 @FromStatus, @ToStatus, @ActorRole, @CreatedAt)",
            audit);

    // El nombre del conductor sale de auth.Users (misma BD, igual que DriverRepository).
    private const string SelectSql = @"
            SELECT a.Id, a.DriverId, u.FullName AS DriverName, a.Action,
                   a.AdminUserId, a.AdminName, a.Reason, a.MissingDocs, a.Deadline,
                   a.FromStatus, a.ToStatus, a.ActorRole, a.CreatedAt
            FROM drivers.ApprovalAudit a
            LEFT JOIN drivers.Drivers d ON d.Id = a.DriverId
            LEFT JOIN auth.Users u ON u.Id = d.UserId";

    public async Task<List<ApprovalAuditRow>> GetByDriverAsync(Guid driverId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<ApprovalAuditRow>(
            SelectSql + " WHERE a.DriverId = @DriverId ORDER BY a.CreatedAt DESC",
            new { DriverId = driverId });
        return rows.ToList();
    }

    // Acciones que cambian el estado del conductor
    private static readonly string[] StatusChangeActions =
    {
        ApprovalAudit.ActionApproved, ApprovalAudit.ActionApprovedException,
        ApprovalAudit.ActionAutoDeactivated, ApprovalAudit.ActionRejected,
        ApprovalAudit.ActionSuspended, ApprovalAudit.ActionReactivated,
        ApprovalAudit.ActionAutoReactivated, ApprovalAudit.ActionExpired,
    };

    public Task<ApprovalAuditRow?> GetLastStatusChangeAsync(Guid driverId, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<ApprovalAuditRow?>(
            SelectSql + " WHERE a.DriverId = @DriverId AND a.Action = ANY(@Actions) ORDER BY a.CreatedAt DESC LIMIT 1",
            new { DriverId = driverId, Actions = StatusChangeActions });

    public async Task<(List<ApprovalAuditRow> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string? action, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var where = string.IsNullOrWhiteSpace(action) ? "" : " WHERE a.Action = @Action";
        var p = new { Action = action, Skip = (page - 1) * pageSize, Take = pageSize };

        var items = (await _db.QueryAsync<ApprovalAuditRow>(
            SelectSql + where + " ORDER BY a.CreatedAt DESC LIMIT @Take OFFSET @Skip", p)).ToList();
        var total = await _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM drivers.ApprovalAudit a" + where, p);
        return (items, total);
    }
}
