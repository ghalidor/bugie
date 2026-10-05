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

    public Task CloseAllActiveAsync(Guid driverUserId, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE drivers.DriverPresenceCheckIns
            SET CheckedOutAt = (now() at time zone 'utc')
            WHERE DriverUserId = @DriverUserId AND CheckedOutAt IS NULL",
            new { DriverUserId = driverUserId });

    public async Task<(List<DriverPresenceCheckIn> Items, int Total)> GetHistoryAsync(
        Guid driverUserId, DateTime? fromUtc, DateTime? toUtc,
        int page, int pageSize, CancellationToken ct = default)
    {
        // Columna "timestamp without time zone" en UTC: los limites van sin zona.
        var p = new
        {
            DriverUserId = driverUserId,
            FromUtc = fromUtc.HasValue ? DateTime.SpecifyKind(fromUtc.Value, DateTimeKind.Unspecified) : (DateTime?)null,
            ToUtc = toUtc.HasValue ? DateTime.SpecifyKind(toUtc.Value, DateTimeKind.Unspecified) : (DateTime?)null,
            Limit = pageSize,
            Offset = (page - 1) * pageSize,
        };
        const string where = @"
            WHERE DriverUserId = @DriverUserId
              AND (@FromUtc::timestamp IS NULL OR CheckedInAt >= @FromUtc::timestamp)
              AND (@ToUtc::timestamp IS NULL OR CheckedInAt < @ToUtc::timestamp)";

        var total = await _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM drivers.DriverPresenceCheckIns" + where, p);
        var items = (await _db.QueryAsync<DriverPresenceCheckIn>(
            "SELECT * FROM drivers.DriverPresenceCheckIns" + where + @"
            ORDER BY CheckedInAt DESC
            LIMIT @Limit OFFSET @Offset", p)).ToList();
        return (items, total);
    }

    public async Task<(int Today, int Last7Days, int Last30Days)> CountSinceAsync(
        Guid driverUserId, DateTime todayUtc, DateTime last7Utc, DateTime last30Utc,
        CancellationToken ct = default)
    {
        var row = await _db.QuerySingleAsync<(long Today, long Last7, long Last30)>(@"
            SELECT
                COUNT(*) FILTER (WHERE CheckedInAt >= @TodayUtc)  AS Today,
                COUNT(*) FILTER (WHERE CheckedInAt >= @Last7Utc)  AS Last7,
                COUNT(*)                                          AS Last30
            FROM drivers.DriverPresenceCheckIns
            WHERE DriverUserId = @DriverUserId AND CheckedInAt >= @Last30Utc",
            new
            {
                DriverUserId = driverUserId,
                TodayUtc = DateTime.SpecifyKind(todayUtc, DateTimeKind.Unspecified),
                Last7Utc = DateTime.SpecifyKind(last7Utc, DateTimeKind.Unspecified),
                Last30Utc = DateTime.SpecifyKind(last30Utc, DateTimeKind.Unspecified),
            });
        return ((int)row.Today, (int)row.Last7, (int)row.Last30);
    }
}
