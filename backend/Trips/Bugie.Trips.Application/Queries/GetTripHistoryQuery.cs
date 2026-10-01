using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Queries;

public record GetTripHistoryQuery(Guid UserId, string Role) : IRequest<List<TripDto>>;
