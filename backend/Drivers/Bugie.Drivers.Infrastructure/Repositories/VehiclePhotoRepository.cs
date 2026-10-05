using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class VehiclePhotoRepository : IVehiclePhotoRepository
{
    private readonly IDbConnection _db;
    public VehiclePhotoRepository(IDbConnection db) => _db = db;

    public async Task<List<VehiclePhoto>> GetByVehicleAsync(Guid vehicleId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<VehiclePhoto>(
            "SELECT * FROM drivers.vehiclephotos WHERE vehicleid = @Id",
            new { Id = vehicleId });
        // Orden fijo: frente, costado, placa
        return rows.OrderBy(p => Array.IndexOf(VehiclePhoto.Types, p.PhotoType)).ToList();
    }

    public Task UpsertAsync(Guid vehicleId, string photoType, string url, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO drivers.vehiclephotos (vehicleid, phototype, url)
            VALUES (@VehicleId, @PhotoType, @Url)
            ON CONFLICT (vehicleid, phototype)
            DO UPDATE SET url = EXCLUDED.url,
                          updatedat = (now() AT TIME ZONE 'utc')",
            new { VehicleId = vehicleId, PhotoType = photoType, Url = url });
}
