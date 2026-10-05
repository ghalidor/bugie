using MediatR;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// KPIs agregados de viajes. Una sola query SQL.
/// Respeta los mismos filtros que GetTripsPagedQuery.
/// </summary>
public record GetTripsStatsQuery(
    List<int>? Statuses,
    string? Search,
    int? ServiceType = null,
    // true = solo programados, false = solo "ahora", null = todos.
    bool? Scheduled = null,
    Guid? PassengerId = null,
    Guid? DriverUserId = null,
    DateTime? From = null,
    DateTime? To = null) : IRequest<TripsStatsDto>;

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
            await _trips.GetStatsAsync(TripAdminFilters.Build(q.Statuses, q.Search, q.ServiceType,
                q.Scheduled, q.PassengerId, q.DriverUserId, q.From, q.To), ct);
        return new TripsStatsDto(total, pending, inProgress, completed, totalFare);
    }
}

/// <summary>
/// Arma el filtro del listado admin. From/To son días de Perú (se ignora la hora):
/// From = desde las 00:00 de ese día; To = hasta el final de ese día.
/// </summary>
public static class TripAdminFilters {
    public static TripAdminFilter Build(List<int>? statuses, string? search, int? serviceType,
        bool? scheduled, Guid? passengerId, Guid? driverUserId, DateTime? from, DateTime? to) =>
        new(statuses, search, serviceType, scheduled, passengerId, driverUserId,
            from.HasValue ? BugieTime.PeruToUtc(from.Value.Date) : null,
            to.HasValue ? BugieTime.PeruToUtc(to.Value.Date.AddDays(1)) : null);
}
