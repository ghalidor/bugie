using System.Data;
using Dapper;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.Repositories;

/// <summary>Libro de Reclamaciones (landing.complaints).</summary>
public class ComplaintRepository : IComplaintRepository
{
    private readonly IDbConnection _db;
    public ComplaintRepository(IDbConnection db) => _db = db;

    // DueDate es DATE: sale como texto "yyyy-MM-dd" para que nadie le aplique zona horaria.
    private const string Cols = @"
        Id, Code, Year, Seq, CreatedAt,
        ConsumerName, ConsumerAddress, DocType, DocNumber, Phone, Email, GuardianName, UserId,
        GoodType, ClaimedAmount, GoodDescription,
        ComplaintType, TripId, TripCode, Reference, Detail, Request,
        Status, to_char(DueDate, 'YYYY-MM-DD') AS DueDate, ResponseDays,
        Response, RespondedAt, RespondedBy, RespondedByName,
        ResponseEmailSent, ConfirmationEmailSent, AccessToken, IsBot, BotReason,
        ClosedReason, ClosedAt, ClosedBy, ClosedByName";

    // Hojas que corren plazo: sin posibles bots.
    private const string Normal = "NOT IsBot";
    // "Todas": todo menos los posibles bots sin revisar (anuladas y descartadas si).
    private const string All = "NOT (IsBot AND Status = 'pendiente')";

    private static string Day(DateTime d) => d.ToString("yyyy-MM-dd");

    public Task<int> NextSeqAsync(int year, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(@"
            INSERT INTO landing.complaintcounters (Year, Last) VALUES (@Year, 1)
            ON CONFLICT (Year) DO UPDATE SET Last = landing.complaintcounters.Last + 1
            RETURNING Last", new { Year = year });

    public async Task<Guid?> FindTripIdByCodeAsync(string code, CancellationToken ct = default)
    {
        // Solo hex y guiones (forma de un id), y al menos 6 caracteres para no adivinar.
        var clean = code.Trim().TrimStart('#').ToLowerInvariant();
        if(clean.Length < 6 || !System.Text.RegularExpressions.Regex.IsMatch(clean, "^[0-9a-f-]+$")) return null;
        var ids = (await _db.QueryAsync<Guid>(
            "SELECT Id FROM trips.Trips WHERE Id::text LIKE @Prefix LIMIT 2",
            new { Prefix = clean + "%" })).ToList();
        return ids.Count == 1 ? ids[0] : null;
    }

    public Task AddAsync(Complaint c, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO landing.complaints
                (Id, Code, Year, Seq, CreatedAt,
                 ConsumerName, ConsumerAddress, DocType, DocNumber, Phone, Email, GuardianName, UserId,
                 GoodType, ClaimedAmount, GoodDescription,
                 ComplaintType, TripId, TripCode, Reference, Detail, Request,
                 Status, DueDate, ResponseDays, AccessToken, IsBot, BotReason)
            VALUES
                (@Id, @Code, @Year, @Seq, @CreatedAt,
                 @ConsumerName, @ConsumerAddress, @DocType, @DocNumber, @Phone, @Email, @GuardianName, @UserId,
                 @GoodType, @ClaimedAmount, @GoodDescription,
                 @ComplaintType, @TripId, @TripCode, @Reference, @Detail, @Request,
                 @Status, CAST(@DueDate AS date), @ResponseDays, @AccessToken, @IsBot, @BotReason)", c);

    public Task<Complaint?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Complaint>(
            $"SELECT {Cols} FROM landing.complaints WHERE Id = @Id", new { Id = id });

    public Task<Complaint?> GetByCodeAsync(string code, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Complaint>(
            $"SELECT {Cols} FROM landing.complaints WHERE Code = @Code", new { Code = code });

    public Task SetConfirmationEmailSentAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("UPDATE landing.complaints SET ConfirmationEmailSent = TRUE WHERE Id = @Id", new { Id = id });

    public Task SetResponseEmailSentAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("UPDATE landing.complaints SET ResponseEmailSent = TRUE WHERE Id = @Id", new { Id = id });

    public async Task<(List<Complaint> items, int total)> GetPagedAsync(
        string? status, string? type, string? search, DateTime today, DateTime dueSoonLimit,
        int page, int pageSize, CancellationToken ct = default,
        DateTime? fromUtc = null, DateTime? toUtc = null)
    {
        var where = new List<string>();
        switch(status)
        {
            case "pendiente":   where.Add($"{Normal} AND Status = 'pendiente'"); break;
            case "por_vencer":  where.Add($"{Normal} AND Status = 'pendiente' AND DueDate >= CAST(@Today AS date) AND DueDate <= CAST(@Soon AS date)"); break;
            case "vencida":     where.Add($"{Normal} AND Status = 'pendiente' AND DueDate < CAST(@Today AS date)"); break;
            case "respondida":  where.Add("Status = 'respondida'"); break;
            case "posible_bot": where.Add("IsBot AND Status = 'pendiente'"); break;
            case "descartada":  where.Add("Status = 'descartada'"); break;
            case "anulada":     where.Add("Status = 'anulada'"); break;
            default:            where.Add(All); break;
        }
        if(type is "reclamo" or "queja") where.Add("ComplaintType = @Type");
        if(!string.IsNullOrWhiteSpace(search))
            where.Add("(Code ILIKE @Q OR ConsumerName ILIKE @Q OR Email ILIKE @Q OR DocNumber ILIKE @Q OR TripCode ILIKE @Q)");
        if(fromUtc.HasValue) where.Add("CreatedAt >= @FromUtc");
        if(toUtc.HasValue)   where.Add("CreatedAt < @ToUtc");

        var sqlWhere = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "";
        var p = new
        {
            Today = Day(today),
            Soon = Day(dueSoonLimit),
            Type = type,
            Q = $"%{search?.Trim()}%",
            FromUtc = fromUtc,
            ToUtc = toUtc,
            Take = pageSize,
            Skip = (page - 1) * pageSize,
        };

        var total = await _db.ExecuteScalarAsync<int>(
            $"SELECT COUNT(*) FROM landing.complaints {sqlWhere}", p);

        // Pendientes primero (la que vence antes arriba); luego cerradas recientes.
        var rows = await _db.QueryAsync<Complaint>($@"
            SELECT {Cols} FROM landing.complaints {sqlWhere}
            ORDER BY (Status = 'pendiente') DESC,
                     CASE WHEN Status = 'pendiente' THEN DueDate END ASC,
                     CreatedAt DESC
            LIMIT @Take OFFSET @Skip", p);

        return (rows.ToList(), total);
    }

    public async Task<ComplaintStats> GetStatsAsync(
        DateTime today, DateTime dueSoonLimit, CancellationToken ct = default)
    {
        var r = await _db.QuerySingleAsync<(long, long, long, long, long, long, long)>(@"
            SELECT
              COUNT(*) FILTER (WHERE NOT IsBot AND Status = 'pendiente'),
              COUNT(*) FILTER (WHERE NOT IsBot AND Status = 'pendiente' AND DueDate >= CAST(@Today AS date) AND DueDate <= CAST(@Soon AS date)),
              COUNT(*) FILTER (WHERE NOT IsBot AND Status = 'pendiente' AND DueDate < CAST(@Today AS date)),
              COUNT(*) FILTER (WHERE Status = 'respondida'),
              COUNT(*) FILTER (WHERE IsBot AND Status = 'pendiente'),
              COUNT(*) FILTER (WHERE Status = 'descartada'),
              COUNT(*) FILTER (WHERE Status = 'anulada')
            FROM landing.complaints",
            new { Today = Day(today), Soon = Day(dueSoonLimit) });
        return new ComplaintStats((int)r.Item1, (int)r.Item2, (int)r.Item3, (int)r.Item4, (int)r.Item5, (int)r.Item6, (int)r.Item7);
    }

    public async Task<bool> DiscardBotAsync(Guid id, string reason, Guid adminId, string adminName,
        DateTime at, CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            UPDATE landing.complaints
               SET Status = 'descartada', ClosedReason = @Reason, ClosedAt = @At,
                   ClosedBy = @AdminId, ClosedByName = @AdminName
             WHERE Id = @Id AND IsBot AND Status = 'pendiente'",
            new { Id = id, Reason = reason, At = at, AdminId = adminId, AdminName = adminName }) > 0;

    public async Task<bool> VoidAsync(Guid id, string reason, Guid adminId, string adminName,
        DateTime at, CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            UPDATE landing.complaints
               SET Status = 'anulada', ClosedReason = @Reason, ClosedAt = @At,
                   ClosedBy = @AdminId, ClosedByName = @AdminName
             WHERE Id = @Id AND Status = 'pendiente'",
            new { Id = id, Reason = reason, At = at, AdminId = adminId, AdminName = adminName }) > 0;

    public async Task<bool> MarkValidAsync(Guid id, string dueDate, int responseDays, CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            UPDATE landing.complaints
               SET IsBot = FALSE, BotReason = NULL, DueDate = CAST(@Due AS date), ResponseDays = @Days
             WHERE Id = @Id AND IsBot AND Status = 'pendiente'", new { Id = id, Due = dueDate, Days = responseDays }) > 0;

    public async Task<bool> SaveResponseAsync(Guid id, string response, Guid adminId, string adminName,
        DateTime respondedAt, CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            UPDATE landing.complaints
               SET Status = 'respondida', Response = @Response, RespondedAt = @At,
                   RespondedBy = @AdminId, RespondedByName = @AdminName
             WHERE Id = @Id AND Status = 'pendiente' AND NOT IsBot",
            new { Id = id, Response = response, At = respondedAt, AdminId = adminId, AdminName = adminName }) > 0;
}
