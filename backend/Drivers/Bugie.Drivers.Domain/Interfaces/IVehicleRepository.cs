using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

public interface IVehicleRepository
{
    Task<List<Vehicle>> GetByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task<Vehicle?>      GetActiveByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task<Vehicle?>      GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Inserta el vehículo y desactiva automáticamente los anteriores.
    /// Solo uno puede estar activo a la vez.
    /// </summary>
    Task AddAsync(Vehicle vehicle, CancellationToken ct = default);

    /// <summary>
    /// Cambia el vehículo activo del conductor.
    /// Desactiva todos los demás del mismo conductor.
    /// </summary>
    Task SetActiveAsync(Guid vehicleId, Guid driverId, CancellationToken ct = default);

    Task UpdateAsync(Vehicle vehicle, CancellationToken ct = default);
}
