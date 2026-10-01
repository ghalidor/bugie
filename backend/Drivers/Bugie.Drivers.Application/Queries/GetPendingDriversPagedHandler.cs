using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using MediatR;

namespace Bugie.Drivers.Application.Queries;

/// <summary>
/// Lista paginada de conductores PENDIENTES de verificación.
/// Filtra automáticamente por status 1 (PendingDocs), 2 (UnderReview)
/// y 6 (ExpiredDocs) — los 3 que requieren revisión del admin.
///
/// Page: 1-based.
/// PageSize: típico 10-25.
/// Search: nombre o email (opcional).
/// </summary>
public record GetPendingDriversPagedQuery(
    int Page,
    int PageSize,
    string? Search) : IRequest<DriversPagedDto>;

public class GetPendingDriversPagedHandler
    : IRequestHandler<GetPendingDriversPagedQuery, DriversPagedDto>
{
    private readonly IDriverRepository _drivers;
    private readonly IAuthClient _auth;

    public GetPendingDriversPagedHandler(IDriverRepository drivers, IAuthClient auth)
        => (_drivers, _auth) = (drivers, auth);

    public async Task<DriversPagedDto> Handle(
        GetPendingDriversPagedQuery q, CancellationToken ct)
    {
        var (list, total) = await _drivers.GetPendingPagedAsync(
            q.Page, q.PageSize, q.Search, ct);

        // Si la página está vacía, evitamos round-trip a Auth.
        if(list.Count == 0)
            return new DriversPagedDto(new List<DriverDto>(), q.Page, q.PageSize, total);

        // Pedimos los nombres/fotos solo de los usuarios de ESTA página.
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
