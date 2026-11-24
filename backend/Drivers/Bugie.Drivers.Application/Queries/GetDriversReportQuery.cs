using MediatR;
using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Queries;

/// <summary>Resumen de gestion de conductores del periodo (panel admin).</summary>
public record GetDriversReportQuery(ReportPeriod Period) : IRequest<DriversReportDto>;

/// <summary>Fechas como texto "YYYY-MM-DD" para que no pasen por el conversor de hora.</summary>
public record DriversReportDto(
    string From,
    string To,
    int Approved,
    int Rejected,
    int Suspended,
    int PendingReviewNow,
    int ApprovedTotal,
    int OnlineNow);

public class GetDriversReportHandler : IRequestHandler<GetDriversReportQuery, DriversReportDto>
{
    private readonly IAdminReportsRepository _reports;
    public GetDriversReportHandler(IAdminReportsRepository reports) => _reports = reports;

    public async Task<DriversReportDto> Handle(GetDriversReportQuery q, CancellationToken ct)
    {
        var r = await _reports.GetDriversSummaryAsync(q.Period, ct);
        return new DriversReportDto(
            q.Period.FromText, q.Period.ToText,
            r.Approved, r.Rejected, r.Suspended,
            r.PendingReviewNow, r.ApprovedTotal, r.OnlineNow);
    }
}
