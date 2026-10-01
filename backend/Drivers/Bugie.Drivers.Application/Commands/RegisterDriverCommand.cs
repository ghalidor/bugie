using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

public record RegisterDriverCommand(Guid UserId) : IRequest<DriverDto>;
