using MediatR;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Pide una página de viajes con filtros opcionales.
/// - Statuses: lista de TripStatus (ej. [1, 7] para pendientes que esperan acción).
///   null o vacía = sin filtro.
/// - Search: matchea en OriginAddress o DestAddress.
/// </summary>
public record GetTripsPagedQuery(
    int Page,
    int PageSize,
    List<int>? Statuses,
    string? Search) : IRequest<TripsPagedDto>;

public record TripsPagedDto(
    List<TripDto> Items,
    int Page,
    int PageSize,
    int Total);

public class GetTripsPagedHandler
    : IRequestHandler<GetTripsPagedQuery, TripsPagedDto> {
    private readonly ITripRepository _trips;
    public GetTripsPagedHandler(ITripRepository trips) => _trips = trips;

    public async Task<TripsPagedDto> Handle(GetTripsPagedQuery q, CancellationToken ct) {
        var (list, total) = await _trips.GetPagedAsync(
            q.Page, q.PageSize, q.Statuses, q.Search, ct);
        var items = list.Select(t => CreateTripHandler.ToDto(t)).ToList();
        return new TripsPagedDto(items, q.Page, q.PageSize, total);
    }
}
