using MediatR;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Devuelve TODOS los viajes de la plataforma. Uso exclusivo del admin.
/// </summary>
public record GetAllTripsQuery() : IRequest<List<TripDto>>;

public class GetAllTripsHandler : IRequestHandler<GetAllTripsQuery, List<TripDto>>
{
    private readonly ITripRepository _trips;
    public GetAllTripsHandler(ITripRepository trips) => _trips = trips;

    public async Task<List<TripDto>> Handle(GetAllTripsQuery q, CancellationToken ct)
    {
        var list = await _trips.GetAllAsync(ct);
        return list.Select(t => CreateTripHandler.ToDto(t)).ToList();
    }
}