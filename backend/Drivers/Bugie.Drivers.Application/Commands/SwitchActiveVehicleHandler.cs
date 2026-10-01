using MediatR;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.Commands;

public class SwitchActiveVehicleHandler : IRequestHandler<SwitchActiveVehicleCommand, VehicleDto>
{
    private readonly IDriverRepository _drivers;
    private readonly IVehicleRepository _vehicles;
    public SwitchActiveVehicleHandler(IDriverRepository d, IVehicleRepository v)
        => (_drivers, _vehicles) = (d, v);

    public async Task<VehicleDto> Handle(SwitchActiveVehicleCommand cmd, CancellationToken ct)
    {
        var driver = await _drivers.GetByUserIdAsync(cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Perfil de conductor no encontrado.");
        var vehicle = await _vehicles.GetByIdAsync(cmd.VehicleId, ct)
            ?? throw new KeyNotFoundException("Vehículo no encontrado.");

        if(vehicle.DriverId != driver.Id)
            throw new UnauthorizedAccessException("Este vehículo no pertenece a tu perfil.");

        await _vehicles.SetActiveAsync(cmd.VehicleId, driver.Id, ct);

        return new VehicleDto(vehicle.Id, vehicle.DriverId, vehicle.Plate,
            vehicle.Brand, vehicle.Model, vehicle.Year, vehicle.Color, true,
            vehicle.PhotoUrl);
    }
}