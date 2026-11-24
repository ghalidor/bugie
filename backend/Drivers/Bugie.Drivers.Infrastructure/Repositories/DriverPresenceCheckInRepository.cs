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
                (Id, DriverUserId, PhotoUrl, CheckedInAt, CheckedOutAt, FaceQualityScore, CreatedAt,
                 Liveness, FaceStatus, FaceScore, FaceModel, FaceReferencePhotoUrl, FaceError, FaceReviewStatus)
            VALUES
                (@Id, @DriverUserId, @PhotoUrl, @CheckedInAt, @CheckedOutAt, @FaceQualityScore, @CreatedAt,
                 @Liveness, @FaceStatus, @FaceScore, @FaceModel, @FaceReferencePhotoUrl, @FaceError, @FaceReviewStatus)",
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
            SET CheckedOutAt = now()
            WHERE DriverUserId = @DriverUserId AND CheckedOutAt IS NULL",
            new { DriverUserId = driverUserId });

    public async Task<(List<DriverPresenceCheckIn> Items, int Total)> GetHistoryAsync(
        Guid driverUserId, DateTime? fromUtc, DateTime? toUtc,
        int page, int pageSize, CancellationToken ct = default)
    {
        // Columna timestamptz: los limites van en UTC.
        var p = new
        {
            DriverUserId = driverUserId,
            FromUtc = fromUtc,
            ToUtc = toUtc,
            Limit = pageSize,
            Offset = (page - 1) * pageSize,
        };
        const string where = @"
            WHERE DriverUserId = @DriverUserId
              AND (@FromUtc::timestamptz IS NULL OR CheckedInAt >= @FromUtc::timestamptz)
              AND (@ToUtc::timestamptz IS NULL OR CheckedInAt < @ToUtc::timestamptz)";

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
                TodayUtc = todayUtc,
                Last7Utc = last7Utc,
                Last30Utc = last30Utc,
            });
        return ((int)row.Today, (int)row.Last7, (int)row.Last30);
    }

    // --- Verificacion facial ---

    public Task<DriverPresenceCheckIn?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<DriverPresenceCheckIn>(
            "SELECT * FROM drivers.DriverPresenceCheckIns WHERE Id = @Id", new { Id = id });

    public async Task<(List<FaceCheckRow> Items, int Total)> GetFaceChecksPagedAsync(
        string? faceStatus, string? reviewStatus, Guid? driverUserId,
        DateTime? fromUtc, DateTime? toUtc, int page, int pageSize, CancellationToken ct = default)
    {
        var p = new
        {
            FaceStatus = faceStatus,
            ReviewStatus = reviewStatus,
            DriverUserId = driverUserId,
            FromUtc = fromUtc,
            ToUtc = toUtc,
            Limit = pageSize,
            Offset = (page - 1) * pageSize,
        };
        const string from = @"
            FROM drivers.DriverPresenceCheckIns c
            JOIN drivers.Drivers d ON d.UserId = c.DriverUserId
            WHERE c.FaceStatus IS NOT NULL
              AND (@FaceStatus::varchar IS NULL OR c.FaceStatus = @FaceStatus::varchar)
              AND (@ReviewStatus::varchar IS NULL OR c.FaceReviewStatus = @ReviewStatus::varchar)
              AND (@DriverUserId::uuid IS NULL OR c.DriverUserId = @DriverUserId::uuid)
              AND (@FromUtc::timestamptz IS NULL OR c.CheckedInAt >= @FromUtc::timestamptz)
              AND (@ToUtc::timestamptz IS NULL OR c.CheckedInAt < @ToUtc::timestamptz)";

        var total = await _db.ExecuteScalarAsync<int>("SELECT COUNT(*)" + from, p);
        var items = (await _db.QueryAsync<FaceCheckRow>(
            "SELECT c.*, d.Id AS DriverId" + from + @"
            ORDER BY c.CheckedInAt DESC
            LIMIT @Limit OFFSET @Offset", p)).ToList();
        return (items, total);
    }

    public async Task<bool> ReviewFaceAsync(Guid id, string reviewStatus, string? note,
        Guid reviewedBy, string? reviewedByName, CancellationToken ct = default)
    {
        var n = await _db.ExecuteAsync(@"
            UPDATE drivers.DriverPresenceCheckIns SET
                FaceReviewStatus   = @ReviewStatus,
                FaceReviewNote     = @Note,
                FaceReviewedBy     = @ReviewedBy,
                FaceReviewedByName = @ReviewedByName,
                FaceReviewedAt     = now()
            WHERE Id = @Id AND FaceReviewStatus = 'pending'",
            new { Id = id, ReviewStatus = reviewStatus, Note = note, ReviewedBy = reviewedBy, ReviewedByName = reviewedByName });
        return n > 0;
    }

    public Task<int> CountPendingFaceReviewsAsync(CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM drivers.DriverPresenceCheckIns WHERE FaceReviewStatus = 'pending'");
}
