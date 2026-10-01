using Bugie.Drivers.Domain.Interfaces;
using MediatR;

namespace Bugie.Drivers.Application.Queries;

/// <summary>
/// KPIs agregados de conductores. Respeta los mismos filtros que GetDriversPagedQuery
/// para que los conteos reflejen lo que el admin está viendo.
/// Una sola query SQL con 6 SUM(CASE WHEN..).
/// </summary>
public record GetDriversStatsQuery(
    int? Status,
    bool? Online,
    string? Search) : IRequest<DriversStatsDto>;

public record DriversStatsDto(
    int Total,
    int Online,
    int PendingDocs,
    int UnderReview,
    int Approved,
    int Expired);

public class GetDriversStatsHandler
    : IRequestHandler<GetDriversStatsQuery, DriversStatsDto> {
    private readonly IDriverRepository _drivers;
    public GetDriversStatsHandler(IDriverRepository drivers) => _drivers = drivers;

    public async Task<DriversStatsDto> Handle(GetDriversStatsQuery q, CancellationToken ct) {
        var (total, online, pendingDocs, underReview, approved, expired) =
            await _drivers.GetStatsAsync(q.Status, q.Online, q.Search, ct);
        return new DriversStatsDto(total, online, pendingDocs, underReview, approved, expired);
    }
}
