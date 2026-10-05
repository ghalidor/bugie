using Dapper;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Interfaces;
using Bugie.Trips.Infrastructure.Time;

namespace Bugie.Trips.Infrastructure.Repositories;

/// <summary>
/// Historial de avisos del admin (trips.adminnotifications) y lecturas
/// (trips.adminnotificationreads). Singleton: abre una conexion por llamada
/// (Npgsql la toma del pool). Fechas en UTC: now() AT TIME ZONE 'UTC'.
/// </summary>
public class AdminNotificationRepository : IAdminNotificationRepository
{
    // Condicion de visibilidad: aviso sin permiso o con algun permiso que el
    // admin tiene. Permission puede traer varios separados por coma
    // (ej. 'view:sos_center,view:live_map' = basta cualquiera de los dos).
    private const string Visible =
        "(n.permission IS NULL OR string_to_array(n.permission, ',') && CAST(@Perms AS text[]))";

    private readonly string _cs;

    public AdminNotificationRepository(IConfiguration cfg) =>
        _cs = BugieTimeSetup.UtcConnectionString(cfg.GetConnectionString("Default"));

    private NpgsqlConnection Open() => new(_cs);

    public async Task<Guid> AddAsync(string type, string title, string? message, string? link,
                                     string? permission, string? dataJson, CancellationToken ct = default)
    {
        await using var db = Open();
        return await db.ExecuteScalarAsync<Guid>(new CommandDefinition(@"
            INSERT INTO trips.adminnotifications
                (id, type, title, message, link, permission, data, createdat)
            VALUES (gen_random_uuid(), @Type, @Title, @Message, @Link, @Permission,
                    CAST(@Data AS jsonb), now() AT TIME ZONE 'UTC')
            RETURNING id",
            new
            {
                Type       = Cut(type, 40),
                Title      = Cut(title, 200),
                Message    = message ?? "",
                Link       = Cut(Blank(link), 300),
                Permission = Cut(Blank(permission), 60),
                Data       = Blank(dataJson),
            }, cancellationToken: ct));
    }

    public async Task<(List<AdminNotification> Items, int Total, int Unread)> GetPageAsync(
        Guid adminUserId, IReadOnlyCollection<string> permissions,
        string? type, DateTime? fromUtc, DateTime? toUtc, bool unreadOnly,
        int page, int pageSize, CancellationToken ct = default)
    {
        await using var db = Open();
        var p = new
        {
            AdminId = adminUserId,
            Perms   = permissions.ToArray(),
            Type    = Blank(type),
            From    = fromUtc,
            To      = toUtc,
            Unread  = unreadOnly,
            Limit   = pageSize,
            Offset  = (page - 1) * pageSize,
        };

        const string from = @"
            FROM trips.adminnotifications n
            LEFT JOIN trips.adminnotificationreads r
                   ON r.notificationid = n.id AND r.adminuserid = @AdminId";
        var where = $@"
            WHERE {Visible}
              AND (CAST(@Type AS text) IS NULL OR n.type = @Type)
              AND (CAST(@From AS timestamp) IS NULL OR n.createdat >= @From)
              AND (CAST(@To   AS timestamp) IS NULL OR n.createdat <  @To)
              AND (NOT @Unread OR r.readat IS NULL)";

        var items = await db.QueryAsync<AdminNotification>(new CommandDefinition($@"
            SELECT n.id, n.type, n.title, n.message, n.link, n.permission,
                   n.data::text AS data, n.createdat, r.readat
            {from} {where}
            ORDER BY n.createdat DESC, n.id
            LIMIT @Limit OFFSET @Offset", p, cancellationToken: ct));

        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(
            $"SELECT COUNT(*)::int {from} {where}", p, cancellationToken: ct));

        var unread = await CountUnreadAsync(db, adminUserId, p.Perms, ct);
        return (items.ToList(), total, unread);
    }

    public async Task<int> CountUnreadAsync(Guid adminUserId, IReadOnlyCollection<string> permissions,
                                            CancellationToken ct = default)
    {
        await using var db = Open();
        return await CountUnreadAsync(db, adminUserId, permissions.ToArray(), ct);
    }

    private static Task<int> CountUnreadAsync(NpgsqlConnection db, Guid adminUserId, string[] perms,
                                              CancellationToken ct) =>
        db.ExecuteScalarAsync<int>(new CommandDefinition($@"
            SELECT COUNT(*)::int
            FROM trips.adminnotifications n
            WHERE {Visible}
              AND NOT EXISTS (SELECT 1 FROM trips.adminnotificationreads r
                              WHERE r.notificationid = n.id AND r.adminuserid = @AdminId)",
            new { AdminId = adminUserId, Perms = perms }, cancellationToken: ct));

    public async Task<bool> MarkReadAsync(Guid id, Guid adminUserId, IReadOnlyCollection<string> permissions,
                                          CancellationToken ct = default)
    {
        await using var db = Open();
        var p = new { Id = id, AdminId = adminUserId, Perms = permissions.ToArray() };

        var visible = await db.ExecuteScalarAsync<bool>(new CommandDefinition($@"
            SELECT EXISTS (SELECT 1 FROM trips.adminnotifications n WHERE n.id = @Id AND {Visible})",
            p, cancellationToken: ct));
        if (!visible) return false;

        // ON CONFLICT: si ya estaba leido conserva la primera fecha de lectura.
        await db.ExecuteAsync(new CommandDefinition(@"
            INSERT INTO trips.adminnotificationreads (notificationid, adminuserid, readat)
            VALUES (@Id, @AdminId, now() AT TIME ZONE 'UTC')
            ON CONFLICT (notificationid, adminuserid) DO NOTHING",
            p, cancellationToken: ct));
        return true;
    }

    public async Task<int> MarkAllReadAsync(Guid adminUserId, IReadOnlyCollection<string> permissions,
                                            CancellationToken ct = default)
    {
        await using var db = Open();
        return await db.ExecuteAsync(new CommandDefinition($@"
            INSERT INTO trips.adminnotificationreads (notificationid, adminuserid, readat)
            SELECT n.id, @AdminId, now() AT TIME ZONE 'UTC'
            FROM trips.adminnotifications n
            WHERE {Visible}
            ON CONFLICT (notificationid, adminuserid) DO NOTHING",
            new { AdminId = adminUserId, Perms = permissions.ToArray() }, cancellationToken: ct));
    }

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string? Cut(string? s, int max) =>
        s is null || s.Length <= max ? s : s[..max];
}
