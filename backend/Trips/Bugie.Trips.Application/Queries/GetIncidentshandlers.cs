using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public record GetIncidentsByTripQuery(Guid TripId) : IRequest<List<IncidentDto>>;

public class GetIncidentsByTripHandler : IRequestHandler<GetIncidentsByTripQuery, List<IncidentDto>>
{
    private readonly IIncidentRepository _incidents;
    private readonly IAuthClient _auth;

    public GetIncidentsByTripHandler(IIncidentRepository incidents, IAuthClient auth)
    {
        _incidents = incidents;
        _auth = auth;
    }

    public async Task<List<IncidentDto>> Handle(GetIncidentsByTripQuery q, CancellationToken ct)
    {
        var list = await _incidents.GetByTripAsync(q.TripId, ct);
        if(list.Count == 0) return new List<IncidentDto>();

        // Enriquecer con nombre del autor (mostrado al admin)
        var userIds = list.Select(i => i.ReportedByUserId).Distinct().ToList();
        var userMap = await _auth.GetUsersByIdsAsync(userIds, ct);

        return list.Select(i => new IncidentDto(
            i.Id,
            i.TripId,
            i.ReportedByUserId,
            i.ReportedByRole,
            i.Description,
            i.CreatedAt,
            ReportedByName: userMap.TryGetValue(i.ReportedByUserId, out var u) ? u.FullName : null
        )).ToList();
    }
}

/// <summary>
/// Devuelve el id del viaje → cantidad de incidencias.
/// Usado por el admin para badges en la lista de viajes.
/// </summary>
public record GetIncidentCountsQuery(List<Guid> TripIds) : IRequest<Dictionary<Guid, int>>;

public class GetIncidentCountsHandler : IRequestHandler<GetIncidentCountsQuery, Dictionary<Guid, int>>
{
    private readonly IIncidentRepository _incidents;
    public GetIncidentCountsHandler(IIncidentRepository incidents) => _incidents = incidents;

    public Task<Dictionary<Guid, int>> Handle(GetIncidentCountsQuery q, CancellationToken ct) =>
        _incidents.CountByTripIdsAsync(q.TripIds, ct);
}