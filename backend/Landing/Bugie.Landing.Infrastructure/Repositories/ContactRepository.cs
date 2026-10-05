using System.Data;
using Dapper;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.Repositories;

public class ContactRepository : IContactRepository
{
    private readonly IDbConnection _db;
    public ContactRepository(IDbConnection db) => _db = db;

    // ??? Mensajes ??????????????????????????????????????????????????????

    public Task AddAsync(ContactMessage msg, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO landing.ContactMessages
                (Id, Name, Email, Subject, Message, IsRead, CreatedAt)
            VALUES
                (@Id, @Name, @Email, @Subject, @Message, @IsRead, @CreatedAt)",
            msg);

    public Task<ContactMessage?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<ContactMessage>(
            "SELECT * FROM landing.ContactMessages WHERE Id = @Id",
            new { Id = id });

    public async Task<(List<ContactMessage> items, int total)> GetPagedAsync(
        string filter, int skip, int take, CancellationToken ct = default)
    {
        // filter normalizado en handler. Acá solo aplicamos.
        var where = filter switch
        {
            "unread" => "WHERE IsRead = FALSE",
            "read" => "WHERE IsRead = TRUE",
            _ => ""
        };

        var totalSql = $"SELECT COUNT(*) FROM landing.ContactMessages {where}";
        var total = await _db.ExecuteScalarAsync<int>(totalSql);

        var rowsSql = $@"
            SELECT * FROM landing.ContactMessages
            {where}
            ORDER BY CreatedAt DESC
            LIMIT @Take OFFSET @Skip";
        var rows = await _db.QueryAsync<ContactMessage>(rowsSql,
            new { Skip = skip, Take = take });

        return (rows.ToList(), total);
    }

    public Task<int> CountUnattendedAsync(CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*)::int FROM landing.ContactMessages WHERE LastReplyAt IS NULL");

    public Task MarkAsReadAsync(Guid id, Guid? adminUserId, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE landing.ContactMessages
            SET IsRead       = TRUE,
                ReadAt       = (now() at time zone 'utc'),
                ReadByUserId = @AdminUserId
            WHERE Id = @Id AND IsRead = FALSE",
            new { Id = id, AdminUserId = adminUserId });

    public Task MarkAsUnreadAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE landing.ContactMessages
            SET IsRead = FALSE, ReadAt = NULL, ReadByUserId = NULL
            WHERE Id = @Id",
            new { Id = id });

    public Task UpdateLastReplyAtAsync(Guid id, DateTime at, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE landing.ContactMessages SET LastReplyAt = @At WHERE Id = @Id",
            new { Id = id, At = at });

    // ??? Respuestas ????????????????????????????????????????????????????

    public Task AddReplyAsync(ContactReply reply, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO landing.ContactReplies
                (Id, ContactId, AdminUserId, AdminName, Subject, Body,
                 Status, ErrorMessage, CreatedAt)
            VALUES
                (@Id, @ContactId, @AdminUserId, @AdminName, @Subject, @Body,
                 @Status, @ErrorMessage, @CreatedAt)",
            reply);

    public async Task<List<ContactReply>> GetRepliesByContactAsync(
        Guid contactId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<ContactReply>(@"
            SELECT * FROM landing.ContactReplies
            WHERE ContactId = @ContactId
            ORDER BY CreatedAt DESC",
            new { ContactId = contactId });
        return rows.ToList();
    }
}
