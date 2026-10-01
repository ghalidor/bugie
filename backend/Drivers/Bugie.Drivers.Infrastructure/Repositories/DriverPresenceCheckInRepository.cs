using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class DriverPresenceCheckInRepository : IDriverPresenceCheckInRepository
{
    private readonly IDbConnection _db;
    public DriverPresenceCheckInRepository(IDbConnection db) => _db = db;

    public async Task<Guid> CreateAsync(DriverPresenceCheckIn e, CancellationToken ct = default)
    {
        e.Id = e.Id == Guid.Empty ? Guid.NewGuid() : e.Id;
        e.CreatedAt = e.CreatedAt == default ? DateTime.UtcNow : e.CreatedAt;
        await _db.ExecuteAsync(@"
            INSERT INTO drivers.DriverPresenceCheckIns
                (Id, DriverUserId, PhotoUrl, CheckedInAt, CheckedOutAt, FaceQualityScore, CreatedAt)
            VALUES
                (@Id, @DriverUserId, @PhotoUrl, @CheckedInAt, @CheckedOutAt, @FaceQualityScore, @CreatedAt)",
            e);
        return e.Id;
    }

    public Task<DriverPresenceCheckIn?> GetActiveAsync(Guid driverUserId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<DriverPresenceCheckIn>(@"
            SELECT * FROM drivers.DriverPresenceCheckIns
            WHERE DriverUserId = @DriverUserId AND CheckedOutAt IS NULL
            ORDER BY CheckedInAt DESC LIMIT 1",
            new { DriverUserId = driverUserId });

    public Task CloseAsync(Guid checkInId, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE drivers.DriverPresenceCheckIns
            SET CheckedOutAt = (now() at time zone 'utc')
            WHERE Id = @Id AND CheckedOutAt IS NULL",
            new { Id = checkInId });

    public Task CloseAllActiveAsync(Guid driverUserId, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE drivers.DriverPresenceCheckIns
            SET CheckedOutAt = (now() at time zone 'utc')
            WHERE DriverUserId = @DriverUserId AND CheckedOutAt IS NULL",
            new { DriverUserId = driverUserId });

    public async Task<List<DriverPresenceCheckIn>> GetHistoryAsync(
        Guid driverUserId, int skip, int take, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<DriverPresenceCheckIn>(@"
            SELECT * FROM drivers.DriverPresenceCheckIns
            WHERE DriverUserId = @DriverUserId
            ORDER BY CheckedInAt DESC
            LIMIT @Take OFFSET @Skip",
            new { DriverUserId = driverUserId, Skip = skip, Take = take });
        return rows.ToList();
    }
}
