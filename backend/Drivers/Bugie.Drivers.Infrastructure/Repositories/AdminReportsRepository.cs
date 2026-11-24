using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

/// <summary>Reportes administrativos de conductores. Todo se agrega en SQL.</summary>
public class AdminReportsRepository : IAdminReportsRepository
{
    private readonly IDbConnection _db;
    public AdminReportsRepository(IDbConnection db) => _db = db;

    public Task<DriversReportRow> GetDriversSummaryAsync(ReportPeriod period, CancellationToken ct = default)
    {
        // Rango UTC [@From, @To).
        // DriverStatus: PendingDocs=1, UnderReview=2, Approved=3, Suspended=4, Rejected=5, ExpiredDocs=6.
        // Pendientes de revision = 1, 2 y 6 (los mismos que la lista de pendientes del admin).
        // Los conteos actuales excluyen cuentas eliminadas, igual que las estadisticas de conductores.
        const string sql = @"
            SELECT
                (SELECT COUNT(*)::int FROM drivers.Drivers d
                 WHERE d.ApprovedAt >= @From AND d.ApprovedAt < @To)                    AS Approved,
                (SELECT COUNT(*)::int FROM drivers.ApprovalAudit a
                 WHERE a.Action = 'rejected'  AND a.CreatedAt >= @From AND a.CreatedAt < @To) AS Rejected,
                (SELECT COUNT(*)::int FROM drivers.ApprovalAudit a
                 WHERE a.Action = 'suspended' AND a.CreatedAt >= @From AND a.CreatedAt < @To) AS Suspended,
                COUNT(*) FILTER (WHERE d.Status IN (1, 2, 6))::int                       AS PendingReviewNow,
                COUNT(*) FILTER (WHERE d.Status = 3)::int                                AS ApprovedTotal,
                COUNT(*) FILTER (WHERE d.Status = 3 AND d.IsOnline)::int                 AS OnlineNow
            FROM drivers.Drivers d
            INNER JOIN auth.Users u ON u.Id = d.UserId
            WHERE u.DeletedAt IS NULL;
        ";

        return _db.QuerySingleAsync<DriversReportRow>(new CommandDefinition(sql,
            new { From = period.FromUtc, To = period.ToUtc }, cancellationToken: ct));
    }
}
