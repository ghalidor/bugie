using System.Data;
using Dapper;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Infrastructure.Repositories;

public class PassengerDocumentRepository : IPassengerDocumentRepository {
    private readonly IDbConnection _db;
    public PassengerDocumentRepository(IDbConnection db) => _db = db;

    public async Task<List<PassengerDocument>> GetByUserAsync(Guid userId, CancellationToken ct = default) {
        var rows = await _db.QueryAsync<PassengerDocument>(
            "SELECT * FROM auth.PassengerDocuments WHERE UserId = @Id ORDER BY CreatedAt DESC",
            new { Id = userId });
        return rows.ToList();
    }

    public Task<PassengerDocument?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<PassengerDocument>(
            "SELECT * FROM auth.PassengerDocuments WHERE Id = @Id", new { Id = id });

    public Task<PassengerDocument?> GetByUserAndTypeAsync(Guid userId, string docType, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<PassengerDocument>(
            "SELECT * FROM auth.PassengerDocuments WHERE UserId = @UserId AND DocType = @DocType",
            new { UserId = userId, DocType = docType });

    public Task AddAsync(PassengerDocument doc, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO auth.PassengerDocuments
                (Id, UserId, DocType, FileUrl, StorageFileId, OriginalFileName, MimeType, SizeBytes,
                 Status, RejectionReason, ReviewedAt, ReviewedBy, CreatedAt)
            VALUES
                (@Id, @UserId, @DocType, @FileUrl, @StorageFileId, @OriginalFileName, @MimeType, @SizeBytes,
                 @Status, @RejectionReason, @ReviewedAt, @ReviewedBy, @CreatedAt)",
            doc);

    public Task UpdateAsync(PassengerDocument doc, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE auth.PassengerDocuments SET
                FileUrl          = @FileUrl,
                StorageFileId    = @StorageFileId,
                OriginalFileName = @OriginalFileName,
                MimeType         = @MimeType,
                SizeBytes        = @SizeBytes,
                Status           = @Status,
                RejectionReason  = @RejectionReason,
                ReviewedAt       = @ReviewedAt,
                ReviewedBy       = @ReviewedBy
            WHERE Id = @Id",
            doc);

    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("DELETE FROM auth.PassengerDocuments WHERE Id = @Id", new { Id = id });
}