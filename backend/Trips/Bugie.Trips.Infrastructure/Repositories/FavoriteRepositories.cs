using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class FavoriteDriverRepository : IFavoriteDriverRepository {
    private readonly IDbConnection _db;
    public FavoriteDriverRepository(IDbConnection db) => _db = db;

    public async Task<List<Guid>> GetByPassengerAsync(Guid passengerId, CancellationToken ct = default) {
        var rows = await _db.QueryAsync<Guid>(@"
            SELECT DriverUserId FROM trips.FavoriteDrivers
            WHERE PassengerId = @PassengerId
            ORDER BY CreatedAt DESC",
            new { PassengerId = passengerId });
        return rows.ToList();
    }

    public async Task<bool> IsFavoriteAsync(
        Guid passengerId, Guid driverUserId, CancellationToken ct = default) {
        var n = await _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(1) FROM trips.FavoriteDrivers
            WHERE PassengerId = @PassengerId AND DriverUserId = @DriverUserId",
            new { PassengerId = passengerId, DriverUserId = driverUserId });
        return n > 0;
    }

    public async Task<bool> AddAsync(
        Guid passengerId, Guid driverUserId, CancellationToken ct = default) {
        // INSERT con NOT EXISTS para evitar excepción de PK duplicada cuando ya
        // existe. Devolvemos true si se insertó (1 fila afectada), false si no.
        var affected = await _db.ExecuteAsync(@"
            INSERT INTO trips.FavoriteDrivers (PassengerId, DriverUserId, CreatedAt)
            SELECT @PassengerId, @DriverUserId, (now() at time zone 'utc')
            WHERE NOT EXISTS (
                SELECT 1 FROM trips.FavoriteDrivers
                WHERE PassengerId = @PassengerId AND DriverUserId = @DriverUserId
            )",
            new { PassengerId = passengerId, DriverUserId = driverUserId });
        return affected > 0;
    }

    public Task RemoveAsync(Guid passengerId, Guid driverUserId, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            DELETE FROM trips.FavoriteDrivers
            WHERE PassengerId = @PassengerId AND DriverUserId = @DriverUserId",
            new { PassengerId = passengerId, DriverUserId = driverUserId });

    public Task<int> CountForDriverAsync(Guid driverUserId, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(1) FROM trips.FavoriteDrivers WHERE DriverUserId = @DriverUserId",
            new { DriverUserId = driverUserId });
}

public class FavoriteAddressRepository : IFavoriteAddressRepository {
    private readonly IDbConnection _db;
    public FavoriteAddressRepository(IDbConnection db) => _db = db;

    public async Task<List<FavoriteAddress>> GetByPassengerAsync(
        Guid passengerId, CancellationToken ct = default) {
        var rows = await _db.QueryAsync<FavoriteAddress>(@"
            SELECT * FROM trips.FavoriteAddresses
            WHERE PassengerId = @PassengerId
            ORDER BY SortOrder, CreatedAt",
            new { PassengerId = passengerId });
        return rows.ToList();
    }

    public Task<FavoriteAddress?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<FavoriteAddress>(
            "SELECT * FROM trips.FavoriteAddresses WHERE Id = @Id", new { Id = id });

    public Task AddAsync(FavoriteAddress address, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO trips.FavoriteAddresses
                (Id, PassengerId, Label, Icon, Address, Description, Lat, Lng, SortOrder, CreatedAt)
            VALUES
                (@Id, @PassengerId, @Label, @Icon, @Address, @Description, @Lat, @Lng, @SortOrder, @CreatedAt)",
            address);

    public Task UpdateAsync(FavoriteAddress address, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE trips.FavoriteAddresses SET
                Label = @Label, Icon = @Icon, Address = @Address, Description = @Description,
                Lat = @Lat, Lng = @Lng, SortOrder = @SortOrder
            WHERE Id = @Id",
            address);

    public async Task<bool> ExistsByLabelAsync(Guid passengerId, string label, Guid? excludeId, CancellationToken ct = default) {
        var count = await _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(1) FROM trips.FavoriteAddresses
            WHERE PassengerId = @PassengerId AND LOWER(Label) = LOWER(@Label)
              AND (@ExcludeId IS NULL OR Id <> @ExcludeId)",
            new { PassengerId = passengerId, Label = label, ExcludeId = excludeId });
        return count > 0;
    }

    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("DELETE FROM trips.FavoriteAddresses WHERE Id = @Id", new { Id = id });

    public async Task<int> GetMaxSortOrderAsync(Guid passengerId, CancellationToken ct = default) {
        var max = await _db.ExecuteScalarAsync<int?>(@"
            SELECT MAX(SortOrder) FROM trips.FavoriteAddresses
            WHERE PassengerId = @PassengerId",
            new { PassengerId = passengerId });
        return max ?? -1;
    }
}
