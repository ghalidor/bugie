using MediatR;
using Bugie.Auth.Domain.Common;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Queries;

/// <summary>Reporte de usuarios del periodo (panel admin).</summary>
public record GetUsersReportQuery(ReportPeriod Period) : IRequest<UsersReportDto>;

/// <summary>Fechas como texto "YYYY-MM-DD" para que no pasen por el conversor de hora.</summary>
public record UsersReportDto(
    string From,
    string To,
    int NewPassengers,
    int NewDrivers,
    UsersReportTotalsDto Totals,
    IReadOnlyList<UsersDailyRow> Daily);

public record UsersReportTotalsDto(int Passengers, int Drivers, int ActiveUsers);

public class GetUsersReportHandler : IRequestHandler<GetUsersReportQuery, UsersReportDto>
{
    private readonly IAdminReportsRepository _reports;
    public GetUsersReportHandler(IAdminReportsRepository reports) => _reports = reports;

    public async Task<UsersReportDto> Handle(GetUsersReportQuery q, CancellationToken ct)
    {
        var data = await _reports.GetUsersReportAsync(q.Period, ct);
        var c    = data.Counts;

        return new UsersReportDto(
            q.Period.FromText, q.Period.ToText,
            c.NewPassengers, c.NewDrivers,
            new UsersReportTotalsDto(c.Passengers, c.Drivers, c.ActiveUsers),
            data.Daily);
    }
}
