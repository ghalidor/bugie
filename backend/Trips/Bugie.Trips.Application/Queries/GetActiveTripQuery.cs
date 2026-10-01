using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Queries;

public record GetActiveTripQuery(Guid UserId) : IRequest<TripDto?>;
