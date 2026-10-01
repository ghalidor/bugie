using MediatR;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public class GetActiveDriversHandler : IRequestHandler<GetActiveDriversQuery, List<Guid>>
{
    private readonly ITripRepository _trips;
    public GetActiveDriversHandler(ITripRepository trips) => _trips = trips;

    public Task<List<Guid>> Handle(GetActiveDriversQuery q, CancellationToken ct) =>
        _trips.GetDriversWithActiveTripAsync(q.DriverUserIds, ct);
}
