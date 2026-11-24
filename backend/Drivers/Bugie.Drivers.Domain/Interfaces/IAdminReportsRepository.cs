using Bugie.Drivers.Domain.Common;

namespace Bugie.Drivers.Domain.Interfaces;

/// <summary>Reportes administrativos de conductores (solo lectura).</summary>
public interface IAdminReportsRepository
{
    /// <summary>Aprobaciones, rechazos y suspensiones del periodo, mas conteos actuales.</summary>
    Task<DriversReportRow> GetDriversSummaryAsync(ReportPeriod period, CancellationToken ct = default);
}

/// <summary>
/// Approved: ApprovedAt en el periodo. Rejected/Suspended: ApprovalAudit del periodo.
/// PendingReviewNow, ApprovedTotal y OnlineNow: estado actual (sin cuentas eliminadas).
/// </summary>
public sealed class DriversReportRow
{
    public int Approved { get; set; }
    public int Rejected { get; set; }
    public int Suspended { get; set; }
    public int PendingReviewNow { get; set; }
    public int ApprovedTotal { get; set; }
    public int OnlineNow { get; set; }
}
