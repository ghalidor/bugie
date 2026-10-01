using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

public record GoOnlineCommand(Guid UserId, double Lat, double Lng) : IRequest<DriverDto>;
