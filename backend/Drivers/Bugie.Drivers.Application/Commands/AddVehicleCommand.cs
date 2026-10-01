using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

public record AddVehicleCommand(
    Guid DriverId, string Plate, string Brand,
    string Model, short Year, string Color) : IRequest<VehicleDto>;
