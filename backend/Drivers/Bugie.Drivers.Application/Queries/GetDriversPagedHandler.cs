using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Application.Services;
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
/// - Deleted: false (defecto) = sin cuentas eliminadas; true = solo eliminadas; null = todas.
/// </summary>
public record GetDriversPagedQuery(
    int Page,
    int PageSize,
    int? Status,
    bool? Online,
    string? Search,
    bool? OpenReview = null,
    bool? Deleted = false) : IRequest<DriversPagedDto>;

public record DriversPagedDto(
    List<DriverDto> Items,
    int Page,
    int PageSize,
    int Total);

public class GetDriversPagedHandler
    : IRequestHandler<GetDriversPagedQuery, DriversPagedDto> {
    private readonly IDriverRepository _drivers;
    private readonly IAuthClient _auth;
    private readonly IDriverReviewRequestRepository _reviews;
    private readonly IVehicleRepository _vehicles;

    public GetDriversPagedHandler(IDriverRepository drivers, IAuthClient auth,
        IDriverReviewRequestRepository reviews, IVehicleRepository vehicles)
        => (_drivers, _auth, _reviews, _vehicles) = (drivers, auth, reviews, vehicles);

    public async Task<DriversPagedDto> Handle(GetDriversPagedQuery q, CancellationToken ct) {
        var (list, total) = await _drivers.GetPagedAsync(
            q.Page, q.PageSize, q.Status, q.Online, q.Search, q.OpenReview, ct, q.Deleted);

        // Si la página está vacía, evitamos un round-trip a Auth.
        if(list.Count == 0)
            return new DriversPagedDto(new List<DriverDto>(), q.Page, q.PageSize, total);

        // Solo pedimos info de los USUARIOS de esta página (max 100), no de todos.
        // Esto es lo que hace que escalemos: 50 drivers en pantalla = 50 nombres
        // a buscar, no 5000.
        var users = await _auth.GetUsersByIdsAsync(list.Select(d => d.UserId), ct);

        // Solicitudes de revisión abiertas de esta página
        var open = (await _reviews.GetOpenByDriversAsync(list.Select(d => d.Id), ct))
            .ToDictionary(r => r.DriverId);

        // Placa del vehiculo activo de cada conductor de la pagina
        var plates = await _vehicles.GetActivePlatesAsync(list.Select(d => d.Id), ct);

        var items = list.Select(d => RegisterDriverHandler.ToDto(d) with
        {
            FullName = users.GetValueOrDefault(d.UserId)?.FullName ?? "Conductor",
            OpenReviewRequest = DriverAccountService.ToDto(open.GetValueOrDefault(d.Id)),
            DeletedAt = users.GetValueOrDefault(d.UserId)?.DeletedAt,
            DeletedReason = users.GetValueOrDefault(d.UserId)?.DeletedReason,
            ActivePlate = plates.GetValueOrDefault(d.Id),
        }).ToList();

        return new DriversPagedDto(items, q.Page, q.PageSize, total);
    }
}
