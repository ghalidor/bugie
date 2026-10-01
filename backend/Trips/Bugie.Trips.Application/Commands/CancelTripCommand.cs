using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Commands;

public record CancelTripCommand(Guid TripId) : IRequest<TripDto>;
