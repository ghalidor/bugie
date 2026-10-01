using MediatR;

namespace Bugie.Trips.Application.Commands;

public record ActivateSosCommand(Guid TripId, Guid UserId, string UserRole, double Lat, double Lng)
    : IRequest<Guid>;