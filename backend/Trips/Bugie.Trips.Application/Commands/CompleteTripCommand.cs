using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Commands;

public record CompleteTripCommand(Guid TripId, decimal FinalFare) : IRequest<TripDto>;
