using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Lista paginada de calificaciones recibidas por un conductor.
/// Usado por:
/// - El propio conductor (Flutter/web) para ver su historial.
/// - El admin (DriverDetail) para auditar.
/// </summary>
public record GetDriverRatingsQuery(Guid DriverUserId, int Page, int PageSize)
    : IRequest<TripRatingPageDto>;

public class GetDriverRatingsHandler
    : IRequestHandler<GetDriverRatingsQuery, TripRatingPageDto>
{
    private readonly ITripRatingRepository _ratings;
    private readonly IAuthClient _auth;

    public GetDriverRatingsHandler(ITripRatingRepository ratings, IAuthClient auth)
    {
        _ratings = ratings;
        _auth = auth;
    }

    public async Task<TripRatingPageDto> Handle(GetDriverRatingsQuery q, CancellationToken ct)
    {
        // 1. Datos paginados + total.
        var page = Math.Max(1, q.Page);
        var pageSize = Math.Clamp(q.PageSize, 1, 50); // hard limit 50/página
        var list = await _ratings.ListByDriverAsync(q.DriverUserId, page, pageSize, ct);
        var total = await _ratings.CountByDriverAsync(q.DriverUserId, ct);

        // 2. Resolver nombres de pasajeros (lote única llamada a Auth).
        var passengerIds = list.Select(r => r.PassengerId).Distinct().ToList();
        var users = passengerIds.Count == 0
            ? new Dictionary<Guid, UserInfoDto>()
            : await _auth.GetUsersByIdsAsync(passengerIds, ct);

        var items = list.Select(r => new TripRatingDto(
            r.Id, r.TripId, r.PassengerId,
            users.TryGetValue(r.PassengerId, out var u) ? u.FullName : "Pasajero",
            r.DriverId, r.Stars, r.Comment, r.CreatedAt
        )).ToList();

        return new TripRatingPageDto(items, page, pageSize, total);
    }
}

/// <summary>
/// Saber si un viaje específico ya tiene calificación (para que el frontend
/// del pasajero muestre "Calificar" o "Ya calificaste" en el historial).
/// </summary>
public record GetTripRatingQuery(Guid TripId) : IRequest<TripRatingDto?>;

/// <summary>
/// Versión batch: devuelve Map {tripId → TripRatingDto} para todos los viajes
/// dados. Evita N llamadas al cargar el historial.
/// Los viajes sin calificación NO aparecen en el resultado (no como null).
/// </summary>
public record GetTripRatingsBatchQuery(List<Guid> TripIds)
    : IRequest<Dictionary<Guid, TripRatingDto>>;

public class GetTripRatingsBatchHandler
    : IRequestHandler<GetTripRatingsBatchQuery, Dictionary<Guid, TripRatingDto>>
{
    private readonly ITripRatingRepository _ratings;
    private readonly IAuthClient _auth;

    public GetTripRatingsBatchHandler(ITripRatingRepository ratings, IAuthClient auth)
    {
        _ratings = ratings;
        _auth = auth;
    }

    public async Task<Dictionary<Guid, TripRatingDto>> Handle(
        GetTripRatingsBatchQuery q, CancellationToken ct)
    {
        var map = await _ratings.GetByTripIdsAsync(q.TripIds, ct);
        if(map.Count == 0) return new Dictionary<Guid, TripRatingDto>();

        // Lote de pasajeros (un solo round-trip a Auth en lugar de N).
        var passengerIds = map.Values.Select(r => r.PassengerId).Distinct().ToList();
        var users = await _auth.GetUsersByIdsAsync(passengerIds, ct);

        return map.ToDictionary(
            kv => kv.Key,
            kv => {
                var r = kv.Value;
                var name = users.TryGetValue(r.PassengerId, out var u)
                    ? u.FullName : "Pasajero";
                return new TripRatingDto(
                    r.Id, r.TripId, r.PassengerId, name,
                    r.DriverId, r.Stars, r.Comment, r.CreatedAt);
            });
    }
}

public class GetTripRatingHandler
    : IRequestHandler<GetTripRatingQuery, TripRatingDto?>
{
    private readonly ITripRatingRepository _ratings;
    private readonly IAuthClient _auth;

    public GetTripRatingHandler(ITripRatingRepository ratings, IAuthClient auth)
    {
        _ratings = ratings;
        _auth = auth;
    }

    public async Task<TripRatingDto?> Handle(GetTripRatingQuery q, CancellationToken ct)
    {
        var r = await _ratings.GetByTripAsync(q.TripId, ct);
        if(r is null) return null;

        var users = await _auth.GetUsersByIdsAsync(new[] { r.PassengerId }, ct);
        var name = users.TryGetValue(r.PassengerId, out var u) ? u.FullName : "Pasajero";

        return new TripRatingDto(
            r.Id, r.TripId, r.PassengerId, name,
            r.DriverId, r.Stars, r.Comment, r.CreatedAt);
    }
}
