using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

public record ApproveDriverCommand(Guid DriverId) : IRequest<DriverDto>;
