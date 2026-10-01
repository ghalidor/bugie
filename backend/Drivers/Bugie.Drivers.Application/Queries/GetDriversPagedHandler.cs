using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using MediatR;

namespace Bugie.Drivers.Application.Queries;

/// <summary>
/// Pide una página de conductores con filtros opcionales.
/// - Page: 1-based.
/// - PageSize: cuántos por página (típico 25-50, máx 100).
/// - Status: 1-6 (DriverStatus). null = todos.
/// - Online: true/false (IsOnline). null = sin filtro.
/// - Search: nombre o email (LIKE '%X%' contra auth.Users JOIN).
/// </summary>
public record GetDriversPagedQuery(
    int Page,
    int PageSize,
    int? Status,
    bool? Online,
    string? Search) : IRequest<DriversPagedDto>;

public record DriversPagedDto(
    List<DriverDto> Items,
    int Page,
    int PageSize,
    int Total);

public class GetDriversPagedHandler
    : IRequestHandler<GetDriversPagedQuery, DriversPagedDto> {
    private readonly IDriverRepository _drivers;
    private readonly IAuthClient _auth;

    public GetDriversPagedHandler(IDriverRepository drivers, IAuthClient auth)
        => (_drivers, _auth) = (drivers, auth);

    public async Task<DriversPagedDto> Handle(GetDriversPagedQuery q, CancellationToken ct) {
        var (list, total) = await _drivers.GetPagedAsync(
            q.Page, q.PageSize, q.Status, q.Online, q.Search, ct);

        // Si la página está vacía, evitamos un round-trip a Auth.
        if(list.Count == 0)
            return new DriversPagedDto(new List<DriverDto>(), q.Page, q.PageSize, total);

        // Solo pedimos info de los USUARIOS de esta página (max 100), no de todos.
        // Esto es lo que hace que escalemos: 50 drivers en pantalla = 50 nombres
        // a buscar, no 5000.
        var users = await _auth.GetUsersByIdsAsync(list.Select(d => d.UserId), ct);

        var items = list.Select(d => new DriverDto(
            d.Id,
            d.UserId,
            users.GetValueOrDefault(d.UserId)?.FullName ?? "Conductor",
            d.Status,
            d.IsOnline,
            d.CurrentLat,
            d.CurrentLng,
            d.Rating,
            d.TotalRatings,
            HasActiveTrip: false,
            d.CreatedAt,
            d.ApprovedAt,
            d.ProfilePhotoUrl
        )).ToList();

        return new DriversPagedDto(items, q.Page, q.PageSize, total);
    }
}
