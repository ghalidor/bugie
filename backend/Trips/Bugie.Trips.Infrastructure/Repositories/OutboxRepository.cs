using System.Data;
using Dapper;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Infrastructure.Repositories;

public class OutboxRepository : IOutboxRepository
{
    private readonly IDbConnection _db;
    public OutboxRepository(IDbConnection db) => _db = db;

    public Task AddAsync(OutboxEvent evt, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO trips.OutboxEvents
                (EventType, PayloadJson, Status, Attempts, CreatedAt)
            VALUES
                (@EventType, @PayloadJson, @Status, @Attempts, @CreatedAt)",
            evt);

    public async Task<List<OutboxEvent>> GetPendingAsync(int limit, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<OutboxEvent>(@"
            SELECT * FROM trips.OutboxEvents
            WHERE Status = 'pending'
            ORDER BY CreatedAt
            LIMIT @Limit",
            new { Limit = limit });
        return rows.ToList();
    }

    public Task MarkSentAsync(long id, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE trips.OutboxEvents
            SET Status = 'sent', SentAt = (now() AT TIME ZONE 'utc'), LastError = NULL
            WHERE Id = @Id",
            new { Id = id });

    public Task MarkAttemptAsync(long id, string error, int maxAttempts, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE trips.OutboxEvents
            SET Attempts  = Attempts + 1,
                LastError = @Error,
                Status    = CASE WHEN Attempts + 1 >= @MaxAttempts THEN 'failed' ELSE 'pending' END
            WHERE Id = @Id",
            new { Id = id, Error = error, MaxAttempts = maxAttempts });
}
