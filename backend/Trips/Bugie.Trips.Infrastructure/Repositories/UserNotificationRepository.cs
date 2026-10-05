using Dapper;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;
using Bugie.Trips.Infrastructure.Time;

namespace Bugie.Trips.Infrastructure.Repositories;

/// <summary>
/// Bandeja de notificaciones (trips.usernotifications).
/// Se registra como singleton porque la usa FcmSender (singleton): abre una
/// conexion nueva por llamada (Npgsql la toma del pool).
/// Las fechas se guardan en UTC: now() AT TIME ZONE 'UTC'.
/// </summary>
public class UserNotificationRepository : IUserNotificationRepository
{
    private readonly string _cs;

    public UserNotificationRepository(IConfiguration cfg) =>
        _cs = BugieTimeSetup.UtcConnectionString(cfg.GetConnectionString("Default"));

    private NpgsqlConnection Open() => new(_cs);

    public async Task<Dictionary<Guid, Guid>> AddForUsersAsync(
        IReadOnlyCollection<Guid> userIds, string title, string body,
        string? type, string? alertType, string? route, string? dataJson,
        CancellationToken ct = default)
    {
        if (userIds.Count == 0) return new Dictionary<Guid, Guid>();

        await using var db = Open();
        // Una fila por usuario en un solo INSERT.
        var rows = await db.QueryAsync<(Guid Id, Guid UserId)>(new CommandDefinition(@"
            INSERT INTO trips.usernotifications
                (id, userid, title, body, type, alerttype, route, data, createdat)
            SELECT gen_random_uuid(), u, @Title, @Body, @Type, @AlertType, @Route,
                   CAST(@Data AS jsonb), now() AT TIME ZONE 'UTC'
            FROM unnest(@UserIds) AS u
            RETURNING id, userid",
            new
            {
                UserIds   = userIds.ToArray(),
                Title     = Cut(title, 200),
                Body      = body ?? "",
                Type      = Cut(type, 60),
                AlertType = Cut(alertType, 30),
                Route     = Cut(route, 300),
                Data      = dataJson,
            }, cancellationToken: ct));

        return rows.ToDictionary(r => r.UserId, r => r.Id);
    }

    public async Task<(List<UserNotification> Items, int Total, int Unread)> GetPageAsync(
        Guid userId, int page, int pageSize, CancellationToken ct = default)
    {
        await using var db = Open();
        var p = new { UserId = userId, Limit = pageSize, Offset = (page - 1) * pageSize };

        var items = await db.QueryAsync<UserNotification>(new CommandDefinition(@"
            SELECT id, userid, title, body, type, alerttype, route,
                   data::text AS data, createdat, readat
            FROM trips.usernotifications
            WHERE userid = @UserId
            ORDER BY createdat DESC, id
            LIMIT @Limit OFFSET @Offset", p, cancellationToken: ct));

        var counts = await db.QuerySingleAsync<(int Total, int Unread)>(new CommandDefinition(@"
            SELECT COUNT(*)::int                                AS total,
                   COUNT(*) FILTER (WHERE readat IS NULL)::int AS unread
            FROM trips.usernotifications
            WHERE userid = @UserId", p, cancellationToken: ct));

        return (items.ToList(), counts.Total, counts.Unread);
    }

    public async Task<int> CountUnreadAsync(Guid userId, CancellationToken ct = default)
    {
        await using var db = Open();
        return await db.ExecuteScalarAsync<int>(new CommandDefinition(@"
            SELECT COUNT(*)::int FROM trips.usernotifications
            WHERE userid = @UserId AND readat IS NULL",
            new { UserId = userId }, cancellationToken: ct));
    }

    public async Task<bool> MarkReadAsync(Guid id, Guid userId, CancellationToken ct = default)
    {
        await using var db = Open();
        // COALESCE: si ya estaba leida conserva la primera fecha de lectura.
        var n = await db.ExecuteAsync(new CommandDefinition(@"
            UPDATE trips.usernotifications
               SET readat = COALESCE(readat, now() AT TIME ZONE 'UTC')
             WHERE id = @Id AND userid = @UserId",
            new { Id = id, UserId = userId }, cancellationToken: ct));
        return n > 0;
    }

    public async Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default)
    {
        await using var db = Open();
        return await db.ExecuteAsync(new CommandDefinition(@"
            UPDATE trips.usernotifications
               SET readat = now() AT TIME ZONE 'UTC'
             WHERE userid = @UserId AND readat IS NULL",
            new { UserId = userId }, cancellationToken: ct));
    }

    private static string? Cut(string? s, int max) =>
        s is null || s.Length <= max ? s : s[..max];
}
