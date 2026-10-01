using MediatR;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// KPIs agregados de viajes. Una sola query SQL.
/// Respeta los mismos filtros que GetTripsPagedQuery.
/// </summary>
public record GetTripsStatsQuery(
    List<int>? Statuses,
    string? Search) : IRequest<TripsStatsDto>;

public record TripsStatsDto(
    int Total,
    int Pending,
    int InProgress,
    int Completed,
    decimal TotalFare);

public class GetTripsStatsHandler
    : IRequestHandler<GetTripsStatsQuery, TripsStatsDto> {
    private readonly ITripRepository _trips;
    public GetTripsStatsHandler(ITripRepository trips) => _trips = trips;

    public async Task<TripsStatsDto> Handle(GetTripsStatsQuery q, CancellationToken ct) {
        var (total, pending, inProgress, completed, totalFare) =
            await _trips.GetStatsAsync(q.Statuses, q.Search, ct);
        return new TripsStatsDto(total, pending, inProgress, completed, totalFare);
    }
}
