using MediatR;

namespace Bugie.Trips.Application.Queries;

public record GetActiveDriversQuery(IEnumerable<Guid> DriverUserIds) : IRequest<List<Guid>>;
