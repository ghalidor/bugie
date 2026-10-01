using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

public record GoOfflineCommand(Guid UserId) : IRequest<DriverDto>;
