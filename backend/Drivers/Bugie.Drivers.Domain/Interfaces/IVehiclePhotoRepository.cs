using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

public interface IVehiclePhotoRepository
{
    /// <summary>Fotos de un vehiculo (front, side, plate; las que existan).</summary>
    Task<List<VehiclePhoto>> GetByVehicleAsync(Guid vehicleId, CancellationToken ct = default);

    /// <summary>Crea la foto de ese tipo o la reemplaza si ya existia.</summary>
    Task UpsertAsync(Guid vehicleId, string photoType, string url, CancellationToken ct = default);
}
