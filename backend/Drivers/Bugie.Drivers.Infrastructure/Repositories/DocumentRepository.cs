using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class DocumentRepository : IDocumentRepository
{
    private readonly IDbConnection _db;
    public DocumentRepository(IDbConnection db) => _db = db;

    public async Task<List<DriverDocument>> GetByDriverAsync(Guid driverId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<DriverDocument>(
            "SELECT * FROM drivers.Documents WHERE DriverId = @Id ORDER BY CreatedAt DESC",
            new { Id = driverId });
        return rows.ToList();
    }

    public async Task<List<DriverDocument>> GetActiveByDriverAsync(Guid driverId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<DriverDocument>(@"
            SELECT * FROM drivers.Documents
            WHERE DriverId = @Id AND Status <> 'superseded'
            ORDER BY CreatedAt DESC",
            new { Id = driverId });
        return rows.ToList();
    }

    public Task<DriverDocument?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<DriverDocument>(
            "SELECT * FROM drivers.Documents WHERE Id = @Id",
            new { Id = id });

    public Task<DriverDocument?> GetByDriverAndTypeAsync(Guid driverId, string docType, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<DriverDocument>(@"
            SELECT * FROM drivers.Documents
            WHERE DriverId = @DriverId AND DocType = @DocType
            ORDER BY CreatedAt DESC LIMIT 1",
            new { DriverId = driverId, DocType = docType });

    public Task<DriverDocument?> GetActiveByDriverAndTypeAsync(Guid driverId, string docType, CancellationToken ct = default) =>
        _db.QueryFirstOrDefaultAsync<DriverDocument>(@"
            SELECT * FROM drivers.Documents
            WHERE DriverId = @DriverId AND DocType = @DocType AND Status <> 'superseded'
            ORDER BY CreatedAt DESC LIMIT 1",
            new { DriverId = driverId, DocType = docType });

    public Task AddAsync(DriverDocument doc, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO drivers.Documents
                (Id, DriverId, DocType, FileUrl, DriveFileId, OriginalFileName, MimeType, SizeBytes,
                 Status, RejectionReason, ExpiresAt, ReviewedAt, ReviewedBy, CreatedAt)
            VALUES
                (@Id, @DriverId, @DocType, @FileUrl, @DriveFileId, @OriginalFileName, @MimeType, @SizeBytes,
                 @Status, @RejectionReason, @ExpiresAt, @ReviewedAt, @ReviewedBy, @CreatedAt)",
            doc);

    public Task UpdateAsync(DriverDocument doc, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE drivers.Documents SET
                FileUrl          = @FileUrl,
                DriveFileId      = @DriveFileId,
                OriginalFileName = @OriginalFileName,
                MimeType         = @MimeType,
                SizeBytes        = @SizeBytes,
                Status           = @Status,
                RejectionReason  = @RejectionReason,
                ExpiresAt        = @ExpiresAt,
                ReviewedAt       = @ReviewedAt,
                ReviewedBy       = @ReviewedBy
            WHERE Id = @Id",
            doc);

    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("DELETE FROM drivers.Documents WHERE Id = @Id", new { Id = id });

    public async Task<List<ExpiringDocumentDto>> GetExpiringSoonAsync(CancellationToken ct = default)
    {
        // Para el job: docs aprobados de conductores Approved que caducan en 0, 3 o 6 días
        const string sql = @"
            SELECT
                d.Id        AS DocumentId,
                d.DriverId  AS DriverId,
                dr.UserId   AS DriverUserId,
                d.DocType   AS DocType,
                d.ExpiresAt AS ExpiresAt,
                (CAST(d.ExpiresAt AS DATE) - CAST((now() at time zone 'utc') AS DATE)) AS DaysUntilExpiry
            FROM drivers.Documents d
            INNER JOIN drivers.Drivers dr ON dr.Id = d.DriverId
            WHERE d.Status = 'approved'
              AND dr.Status = 3
              AND d.DocType IN ('license', 'soat', 'revision_tecnica')
              AND d.ExpiresAt IS NOT NULL
              AND (CAST(d.ExpiresAt AS DATE) - CAST((now() at time zone 'utc') AS DATE)) IN (0, 3, 6);";

        var rows = await _db.QueryAsync<ExpiringDocumentDto>(sql);
        return rows.ToList();
    }

    public async Task<List<ExpiringDocumentDto>> GetExpiringWithinDaysAsync(int days, CancellationToken ct = default)
    {
        // Docs aprobados de conductores Approved cuya caducidad está dentro de N días (puede estar vencida también)
        const string sql = @"
            SELECT
                d.Id        AS DocumentId,
                d.DriverId  AS DriverId,
                dr.UserId   AS DriverUserId,
                d.DocType   AS DocType,
                d.ExpiresAt AS ExpiresAt,
                (CAST(d.ExpiresAt AS DATE) - CAST((now() at time zone 'utc') AS DATE)) AS DaysUntilExpiry
            FROM drivers.Documents d
            INNER JOIN drivers.Drivers dr ON dr.Id = d.DriverId
            WHERE d.Status = 'approved'
              AND dr.Status = 3
              AND d.DocType IN ('license', 'soat', 'revision_tecnica')
              AND d.ExpiresAt IS NOT NULL
              AND (CAST(d.ExpiresAt AS DATE) - CAST((now() at time zone 'utc') AS DATE)) <= @Days
            ORDER BY d.ExpiresAt ASC;";

        var rows = await _db.QueryAsync<ExpiringDocumentDto>(sql, new { Days = days });
        return rows.ToList();
    }

    public async Task<List<ExpiringDocumentDto>> GetExpiringWithinDaysByDriverAsync(
        Guid driverId, int days, CancellationToken ct = default)
    {
        const string sql = @"
            SELECT
                d.Id        AS DocumentId,
                d.DriverId  AS DriverId,
                dr.UserId   AS DriverUserId,
                d.DocType   AS DocType,
                d.ExpiresAt AS ExpiresAt,
                (CAST(d.ExpiresAt AS DATE) - CAST((now() at time zone 'utc') AS DATE)) AS DaysUntilExpiry
            FROM drivers.Documents d
            INNER JOIN drivers.Drivers dr ON dr.Id = d.DriverId
            WHERE d.DriverId = @DriverId
              AND d.Status = 'approved'
              AND d.DocType IN ('license', 'soat', 'revision_tecnica')
              AND d.ExpiresAt IS NOT NULL
              AND (CAST(d.ExpiresAt AS DATE) - CAST((now() at time zone 'utc') AS DATE)) <= @Days
            ORDER BY d.ExpiresAt ASC;";

        var rows = await _db.QueryAsync<ExpiringDocumentDto>(sql, new { DriverId = driverId, Days = days });
        return rows.ToList();
    }
}