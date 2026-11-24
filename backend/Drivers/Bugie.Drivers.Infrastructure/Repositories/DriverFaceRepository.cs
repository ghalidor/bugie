using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

/// <summary>
/// Huella facial de referencia e intentos de foto de perfil (columnas timestamptz;
/// las huellas son real[] y se leen como float[]).
/// </summary>
public class DriverFaceRepository : IDriverFaceRepository
{
    private readonly IDbConnection _db;
    public DriverFaceRepository(IDbConnection db) => _db = db;

    public Task<DriverFaceReference?> GetReferenceAsync(Guid driverId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<DriverFaceReference>(
            "SELECT * FROM drivers.DriverFaceReferences WHERE DriverId = @DriverId",
            new { DriverId = driverId });

    public Task UpsertReferenceAsync(DriverFaceReference r, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO drivers.DriverFaceReferences
                (DriverId, Embedding, Model, PhotoUrl, FileId, AttemptId, AutoApproved,
                 ApprovedBy, ApprovedByName, ApprovedAt)
            VALUES
                (@DriverId, @Embedding, @Model, @PhotoUrl, @FileId, @AttemptId, @AutoApproved,
                 @ApprovedBy, @ApprovedByName, @ApprovedAt)
            ON CONFLICT (DriverId) DO UPDATE SET
                Embedding      = EXCLUDED.Embedding,
                Model          = EXCLUDED.Model,
                PhotoUrl       = EXCLUDED.PhotoUrl,
                FileId         = EXCLUDED.FileId,
                AttemptId      = EXCLUDED.AttemptId,
                AutoApproved   = EXCLUDED.AutoApproved,
                ApprovedBy     = EXCLUDED.ApprovedBy,
                ApprovedByName = EXCLUDED.ApprovedByName,
                ApprovedAt     = EXCLUDED.ApprovedAt", r);

    public Task AddAttemptAsync(DriverProfilePhotoAttempt a, CancellationToken ct = default)
    {
        if(a.Id == Guid.Empty) a.Id = Guid.NewGuid();
        if(a.CreatedAt == default) a.CreatedAt = DateTime.UtcNow;
        return _db.ExecuteAsync(@"
            INSERT INTO drivers.DriverProfilePhotoAttempts
                (Id, DriverId, PhotoUrl, FileId, PreviousPhotoUrl, Embedding, Model, Score,
                 FaceResult, FaceError, Status, AutoApproved, Reason,
                 ReviewedBy, ReviewedByName, ReviewedAt, CreatedAt)
            VALUES
                (@Id, @DriverId, @PhotoUrl, @FileId, @PreviousPhotoUrl, @Embedding, @Model, @Score,
                 @FaceResult, @FaceError, @Status, @AutoApproved, @Reason,
                 @ReviewedBy, @ReviewedByName, @ReviewedAt, @CreatedAt)", a);
    }

    public Task<DriverProfilePhotoAttempt?> GetAttemptAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<DriverProfilePhotoAttempt>(
            "SELECT * FROM drivers.DriverProfilePhotoAttempts WHERE Id = @Id", new { Id = id });

    public Task<DriverProfilePhotoAttempt?> GetLatestAttemptAsync(Guid driverId, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<DriverProfilePhotoAttempt>(@"
            SELECT * FROM drivers.DriverProfilePhotoAttempts
            WHERE DriverId = @DriverId
            ORDER BY CreatedAt DESC LIMIT 1", new { DriverId = driverId });

    public Task<int> CountAttemptsSinceAsync(Guid driverId, DateTime sinceUtc, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(*) FROM drivers.DriverProfilePhotoAttempts
            WHERE DriverId = @DriverId AND FaceResult <> 'disabled' AND CreatedAt >= @SinceUtc",
            new { DriverId = driverId, SinceUtc = sinceUtc });

    public Task ReplacePendingAsync(Guid driverId, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE drivers.DriverProfilePhotoAttempts SET Status = 'replaced'
            WHERE DriverId = @DriverId AND Status = 'pending_review'",
            new { DriverId = driverId });

    public Task<bool> HasPendingAsync(Guid driverId, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<bool>(@"
            SELECT EXISTS (SELECT 1 FROM drivers.DriverProfilePhotoAttempts
                           WHERE DriverId = @DriverId AND Status = 'pending_review')",
            new { DriverId = driverId });

    public async Task<bool> ReviewAttemptAsync(Guid id, string status, string? reason,
        Guid reviewedBy, string? reviewedByName, CancellationToken ct = default)
    {
        var n = await _db.ExecuteAsync(@"
            UPDATE drivers.DriverProfilePhotoAttempts SET
                Status         = @Status,
                Reason         = @Reason,
                ReviewedBy     = @ReviewedBy,
                ReviewedByName = @ReviewedByName,
                ReviewedAt     = now()
            WHERE Id = @Id AND Status = 'pending_review'",
            new { Id = id, Status = status, Reason = reason, ReviewedBy = reviewedBy, ReviewedByName = reviewedByName });
        return n > 0;
    }

    public async Task<(List<DriverProfilePhotoAttempt> Items, int Total)> GetAttemptsPagedAsync(
        string? status, Guid? driverId, DateTime? fromUtc, DateTime? toUtc,
        int page, int pageSize, CancellationToken ct = default)
    {
        var p = new
        {
            Status = status,
            DriverId = driverId,
            FromUtc = fromUtc,
            ToUtc = toUtc,
            Limit = pageSize,
            Offset = (page - 1) * pageSize,
        };
        const string where = @"
            WHERE (@Status::varchar IS NULL OR Status = @Status::varchar)
              AND (@DriverId::uuid IS NULL OR DriverId = @DriverId::uuid)
              AND (@FromUtc::timestamptz IS NULL OR CreatedAt >= @FromUtc::timestamptz)
              AND (@ToUtc::timestamptz IS NULL OR CreatedAt < @ToUtc::timestamptz)";

        var total = await _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM drivers.DriverProfilePhotoAttempts" + where, p);
        // La huella no hace falta en los listados.
        var items = (await _db.QueryAsync<DriverProfilePhotoAttempt>(@"
            SELECT Id, DriverId, PhotoUrl, FileId, PreviousPhotoUrl, Model, Score, FaceResult, FaceError,
                   Status, AutoApproved, Reason, ReviewedBy, ReviewedByName, ReviewedAt, CreatedAt
            FROM drivers.DriverProfilePhotoAttempts" + where + @"
            ORDER BY CreatedAt DESC
            LIMIT @Limit OFFSET @Offset", p)).ToList();
        return (items, total);
    }

    public Task<int> CountPendingAttemptsAsync(CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM drivers.DriverProfilePhotoAttempts WHERE Status = 'pending_review'");
}
