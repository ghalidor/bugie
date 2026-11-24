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
              AND (NextAttemptAt IS NULL OR NextAttemptAt <= now())
            ORDER BY CreatedAt
            LIMIT @Limit",
            new { Limit = limit });
        return rows.ToList();
    }

    public Task MarkSentAsync(long id, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE trips.OutboxEvents
            SET Status = 'sent', SentAt = now(), LastError = NULL
            WHERE Id = @Id",
            new { Id = id });

    public Task MarkAttemptAsync(long id, string error, int maxAttempts, bool permanent,
        TimeSpan retryDelay, TimeSpan maxDelay, CancellationToken ct = default) =>
        // Espera: retryDelay * 2^intentos, con tope maxDelay (5s, 10s, 20s...).
        _db.ExecuteAsync(@"
            UPDATE trips.OutboxEvents
            SET Attempts      = Attempts + 1,
                LastError     = @Error,
                NextAttemptAt = now() + make_interval(secs =>
                                    LEAST(@MaxSecs, @BaseSecs * power(2, LEAST(Attempts, 20)))),
                Status        = CASE WHEN @Permanent AND Attempts + 1 >= @MaxAttempts
                                     THEN 'failed' ELSE 'pending' END
            WHERE Id = @Id",
            new
            {
                Id          = id,
                Error       = error,
                MaxAttempts = maxAttempts,
                Permanent   = permanent,
                BaseSecs    = Math.Max(1.0, retryDelay.TotalSeconds),
                MaxSecs     = Math.Max(1.0, maxDelay.TotalSeconds),
            });
}
