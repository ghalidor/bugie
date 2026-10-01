using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

public record SwitchActiveVehicleCommand(Guid UserId, Guid VehicleId) : IRequest<VehicleDto>;
