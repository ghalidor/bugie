using MediatR;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Pide una página de viajes con filtros opcionales.
/// - Statuses: lista de TripStatus (ej. [1, 7] para pendientes que esperan acción).
///   null o vacía = sin filtro.
/// - Search: dirección, pasajero/conductor (nombre, correo, documento, celular) o placa.
/// - PassengerId / DriverUserId: viajes de un pasajero o de un conductor (UserId).
/// - From / To: rango de fechas de creación (días de Perú, ambos incluidos).
/// </summary>
public record GetTripsPagedQuery(
    int Page,
    int PageSize,
    List<int>? Statuses,
    string? Search,
    int? ServiceType = null,
    // true = solo programados, false = solo "ahora", null = todos.
    bool? Scheduled = null,
    Guid? PassengerId = null,
    Guid? DriverUserId = null,
    DateTime? From = null,
    DateTime? To = null) : IRequest<TripsPagedDto>;

public record TripsPagedDto(
    List<TripDto> Items,
    int Page,
    int PageSize,
    int Total);

public class GetTripsPagedHandler
    : IRequestHandler<GetTripsPagedQuery, TripsPagedDto> {
    private readonly ITripRepository _trips;
    private readonly IAuthClient     _auth;
    public GetTripsPagedHandler(ITripRepository trips, IAuthClient auth)
        => (_trips, _auth) = (trips, auth);

    public async Task<TripsPagedDto> Handle(GetTripsPagedQuery q, CancellationToken ct) {
        var filter = TripAdminFilters.Build(q.Statuses, q.Search, q.ServiceType, q.Scheduled,
            q.PassengerId, q.DriverUserId, q.From, q.To);
        var (list, total) = await _trips.GetPagedAsync(q.Page, q.PageSize, filter, ct);
        // Nombres del pasajero y del conductor para el admin (una sola llamada a Auth).
        var ids = list.Select(t => t.PassengerId)
            .Concat(list.Where(t => t.DriverId.HasValue).Select(t => t.DriverId!.Value))
            .Distinct().ToList();
        var users = ids.Count == 0
            ? new Dictionary<Guid, UserInfoDto>()
            : await _auth.GetUsersByIdsAsync(ids, ct);

        var items = list.Select(t => CreateTripHandler.ToDto(t,
            passengerName: users.GetValueOrDefault(t.PassengerId)?.FullName,
            driverName:    t.DriverId.HasValue ? users.GetValueOrDefault(t.DriverId.Value)?.FullName : null))
            .ToList();
        return new TripsPagedDto(items, q.Page, q.PageSize, total);
    }
}
