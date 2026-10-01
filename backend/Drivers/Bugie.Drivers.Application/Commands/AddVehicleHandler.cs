using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

public class AddVehicleHandler : IRequestHandler<AddVehicleCommand, VehicleDto>
{
    private readonly IVehicleRepository _vehicles;
    public AddVehicleHandler(IVehicleRepository vehicles) => _vehicles = vehicles;

    public async Task<VehicleDto> Handle(AddVehicleCommand cmd, CancellationToken ct)
    {
        var vehicle = Vehicle.Create(cmd.DriverId, cmd.Plate, cmd.Brand,
                                      cmd.Model, cmd.Year, cmd.Color);
        await _vehicles.AddAsync(vehicle, ct);
        return new VehicleDto(vehicle.Id, vehicle.DriverId, vehicle.Plate,
            vehicle.Brand, vehicle.Model, vehicle.Year, vehicle.Color, vehicle.IsActive,
            vehicle.PhotoUrl);
    }
}