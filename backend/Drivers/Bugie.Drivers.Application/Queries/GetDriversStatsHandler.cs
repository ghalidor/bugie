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
    string? Search,
    bool? OpenReview = null,
    bool? Deleted = false) : IRequest<DriversStatsDto>;

public record DriversStatsDto(
    int Total,
    int Online,
    int PendingDocs,
    int UnderReview,
    int Approved,
    int Expired,
    int Suspended,
    int Rejected,
    int OpenReviewRequests);

public class GetDriversStatsHandler
    : IRequestHandler<GetDriversStatsQuery, DriversStatsDto> {
    private readonly IDriverRepository _drivers;
    public GetDriversStatsHandler(IDriverRepository drivers) => _drivers = drivers;

    public async Task<DriversStatsDto> Handle(GetDriversStatsQuery q, CancellationToken ct) {
        var s = await _drivers.GetStatsAsync(q.Status, q.Online, q.Search, q.OpenReview, ct, q.Deleted);
        return new DriversStatsDto(s.Total, s.Online, s.PendingDocs, s.UnderReview, s.Approved, s.Expired,
            s.Suspended, s.Rejected, s.OpenReviewRequests);
    }
}
