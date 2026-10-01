using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Commands;

public record AcceptTripCommand(Guid TripId, Guid DriverId) : IRequest<TripDto>;