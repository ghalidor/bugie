using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Commands;

public record StartTripCommand(Guid TripId) : IRequest<TripDto>;
