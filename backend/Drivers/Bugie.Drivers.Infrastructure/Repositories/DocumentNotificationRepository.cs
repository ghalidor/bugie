using System.Data;
using Dapper;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Infrastructure.Repositories;

public class DocumentNotificationRepository : IDocumentNotificationRepository
{
    private readonly IDbConnection _db;
    public DocumentNotificationRepository(IDbConnection db) => _db = db;

    public async Task<bool> ExistsAsync(Guid documentId, int daysBefore, CancellationToken ct = default)
    {
        var n = await _db.ExecuteScalarAsync<int>(@"
            SELECT COUNT(1) FROM drivers.DocumentNotifications
            WHERE DocumentId = @DocumentId AND DaysBefore = @DaysBefore",
            new { DocumentId = documentId, DaysBefore = daysBefore });
        return n > 0;
    }

    public Task AddAsync(DocumentNotification n, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO drivers.DocumentNotifications (Id, DocumentId, DaysBefore, NotifiedAt)
            VALUES (@Id, @DocumentId, @DaysBefore, @NotifiedAt)",
            n);
}