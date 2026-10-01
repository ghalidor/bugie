using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

public record UpdateLocationCommand(
    Guid UserId, double Lat, double Lng,
    Guid? TripId = null, double? Speed = null, double? Heading = null) : IRequest<Unit>;
