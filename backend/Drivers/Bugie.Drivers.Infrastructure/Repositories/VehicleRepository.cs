using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class VehicleRepository : IVehicleRepository
{
    private readonly IDbConnection _db;
    public VehicleRepository(IDbConnection db) => _db = db;

    public async Task<List<Vehicle>> GetByDriverAsync(Guid driverId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Vehicle>(
            "SELECT * FROM drivers.Vehicles WHERE DriverId = @Id ORDER BY CreatedAt DESC",
            new { Id = driverId });
        return rows.ToList();
    }

    public Task<Vehicle?> GetActiveByDriverAsync(Guid driverId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Vehicle>(
            "SELECT * FROM drivers.Vehicles WHERE DriverId = @Id AND IsActive = TRUE LIMIT 1",
            new { Id = driverId });

    public Task<Vehicle?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Vehicle>(
            "SELECT * FROM drivers.Vehicles WHERE Id = @Id", new { Id = id });

    public async Task AddAsync(Vehicle vehicle, CancellationToken ct = default)
    {
        await _db.ExecuteAsync(
            "UPDATE drivers.Vehicles SET IsActive = FALSE WHERE DriverId = @DriverId",
            new { vehicle.DriverId });

        await _db.ExecuteAsync(@"
            INSERT INTO drivers.Vehicles
                (Id, DriverId, Plate, Brand, Model, Year, Color, PhotoUrl, IsActive, CreatedAt)
            VALUES
                (@Id, @DriverId, @Plate, @Brand, @Model, @Year, @Color, @PhotoUrl, TRUE, @CreatedAt)",
            vehicle);
    }

    public async Task SetActiveAsync(Guid vehicleId, Guid driverId, CancellationToken ct = default)
    {
        await _db.ExecuteAsync(
            "UPDATE drivers.Vehicles SET IsActive = FALSE WHERE DriverId = @DriverId",
            new { DriverId = driverId });

        await _db.ExecuteAsync(
            "UPDATE drivers.Vehicles SET IsActive = TRUE WHERE Id = @Id AND DriverId = @DriverId",
            new { Id = vehicleId, DriverId = driverId });
    }

    /// <summary>
    /// Actualiza campos editables (IsActive y PhotoUrl).
    /// Para reactivar/desactivar y para guardar la foto.
    /// </summary>
    public Task UpdateAsync(Vehicle vehicle, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE drivers.Vehicles
            SET IsActive = @IsActive,
                PhotoUrl = @PhotoUrl
            WHERE Id = @Id",
            vehicle);
}