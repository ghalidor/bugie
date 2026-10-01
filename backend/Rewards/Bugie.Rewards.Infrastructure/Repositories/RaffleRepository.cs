using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;
using Bugie.Rewards.Domain.Services;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class RaffleRepository : IRaffleRepository
{
    private readonly IDbConnection _db;
    public RaffleRepository(IDbConnection db) => _db = db;

    /* ── Sorteos ─────────────────────────────────────────────────────── */

    public async Task<List<Raffle>> GetAllAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Raffle>(
            "SELECT * FROM rewards.Raffles ORDER BY DrawDate DESC");
        return rows.ToList();
    }

    public async Task<List<Raffle>> GetOpenAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Raffle>(
            "SELECT * FROM rewards.Raffles WHERE Status = 'open' ORDER BY DrawDate");
        return rows.ToList();
    }

    public async Task<List<Raffle>> GetDueAsync(CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Raffle>(@"
            SELECT * FROM rewards.Raffles
            WHERE Status IN ('open','closed') AND DrawDate <= now()
            ORDER BY DrawDate");
        return rows.ToList();
    }

    public Task<Raffle?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Raffle>(
            "SELECT * FROM rewards.Raffles WHERE Id = @Id", new { Id = id });

    public Task AddAsync(Raffle r, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO rewards.Raffles
                (Id, Name, RaffleType, PrizeDescription, PrizeValue, DrawDate,
                 MinLevelRequired, MinMonthsActive, TargetUserType, WinnersCount,
                 Status, DrawSeed, DrawnAt, TicketsAtDraw, CreatedAt, UpdatedAt)
            VALUES
                (@Id, @Name, @RaffleType, @PrizeDescription, @PrizeValue, @DrawDate,
                 @MinLevelRequired, @MinMonthsActive, @TargetUserType, @WinnersCount,
                 @Status, @DrawSeed, @DrawnAt, @TicketsAtDraw, @CreatedAt, @UpdatedAt)",
            r);

    public Task UpdateAsync(Raffle r, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.Raffles SET
                Name             = @Name,
                RaffleType       = @RaffleType,
                PrizeDescription = @PrizeDescription,
                PrizeValue       = @PrizeValue,
                DrawDate         = @DrawDate,
                MinLevelRequired = @MinLevelRequired,
                MinMonthsActive  = @MinMonthsActive,
                TargetUserType   = @TargetUserType,
                WinnersCount     = @WinnersCount,
                Status           = @Status,
                DrawSeed         = @DrawSeed,
                DrawnAt          = @DrawnAt,
                TicketsAtDraw    = @TicketsAtDraw,
                UpdatedAt        = @UpdatedAt
            WHERE Id = @Id",
            r);

    public Task DeleteAsync(Guid id, CancellationToken ct = default) =>
        _db.ExecuteAsync("DELETE FROM rewards.Raffles WHERE Id = @Id", new { Id = id });

    /* ── Tickets ─────────────────────────────────────────────────────── */

    public async Task<List<RaffleTicket>> GetTicketsAsync(Guid raffleId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<RaffleTicket>(@"
            SELECT * FROM rewards.RaffleTickets
            WHERE RaffleId = @RaffleId
            ORDER BY TicketNumber",
            new { RaffleId = raffleId });
        return rows.ToList();
    }

    public Task<int> CountTicketsAsync(Guid raffleId, CancellationToken ct = default) =>
        _db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM rewards.RaffleTickets WHERE RaffleId = @RaffleId",
            new { RaffleId = raffleId });

    public Task<int> CountUserTicketsAsync(
        Guid raffleId, Guid userId, string? source, CancellationToken ct = default)
    {
        var filtro = source is null ? "" : " AND Source = @Source";
        return _db.ExecuteScalarAsync<int>($@"
            SELECT COUNT(*) FROM rewards.RaffleTickets
            WHERE RaffleId = @RaffleId AND UserId = @UserId{filtro}",
            new { RaffleId = raffleId, UserId = userId, Source = source });
    }

    /// <summary>
    /// Entrega tickets numerados de forma correlativa dentro del sorteo.
    ///
    /// Se bloquea la fila del sorteo mientras se numera. Sin ese bloqueo, dos
    /// procesos simultáneos leerían el mismo número máximo y chocarían contra
    /// el índice único de (RaffleId, TicketNumber).
    /// </summary>
    public async Task<int> GrantTicketsAsync(
        Guid raffleId, Guid userId, Guid profileId, int quantity,
        string source, Guid? referenceId, CancellationToken ct = default)
    {
        if (quantity <= 0) return 0;

        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            // Bloquea el sorteo para numerar sin carreras.
            var existe = await _db.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM rewards.Raffles WHERE Id = @Id FOR UPDATE",
                new { Id = raffleId }, trx);

            if (existe == 0) { trx.Rollback(); return 0; }

            var desde = await _db.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM rewards.RaffleTickets WHERE RaffleId = @RaffleId",
                new { RaffleId = raffleId }, trx);

            var filas = Enumerable.Range(1, quantity).Select(i => new
            {
                Id           = Guid.NewGuid(),
                RaffleId     = raffleId,
                UserId       = userId,
                ProfileId    = profileId,
                TicketNumber = RaffleDraw.TicketNumber(desde + i),
                Source       = source,
                ReferenceId  = referenceId,
            }).ToList();

            var creados = await _db.ExecuteAsync(@"
                INSERT INTO rewards.RaffleTickets
                    (Id, RaffleId, UserId, ProfileId, TicketNumber, Source, ReferenceId, CreatedAt)
                VALUES
                    (@Id, @RaffleId, @UserId, @ProfileId, @TicketNumber, @Source, @ReferenceId, now())
                ON CONFLICT DO NOTHING",
                filas, trx);

            trx.Commit();
            return creados;
        }
        catch
        {
            trx.Rollback();
            throw;
        }
        finally
        {
            if (wasClosed && _db.State == ConnectionState.Open) _db.Close();
        }
    }

    private sealed class SummaryRow
    {
        public Guid     Id               { get; set; }
        public string   Name             { get; set; } = string.Empty;
        public string   RaffleType       { get; set; } = string.Empty;
        public string   PrizeDescription { get; set; } = string.Empty;
        public decimal? PrizeValue       { get; set; }
        public DateTime DrawDate         { get; set; }
        public string   Status           { get; set; } = string.Empty;
        public int      Tickets          { get; set; }
    }

    public async Task<List<(Raffle Raffle, int Tickets)>> GetUserTicketsSummaryAsync(
        Guid userId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<SummaryRow>(@"
            SELECT r.Id, r.Name, r.RaffleType, r.PrizeDescription, r.PrizeValue,
                   r.DrawDate, r.Status,
                   COUNT(t.Id) AS Tickets
            FROM rewards.Raffles r
            JOIN rewards.RaffleTickets t ON t.RaffleId = r.Id AND t.UserId = @UserId
            GROUP BY r.Id
            ORDER BY r.DrawDate DESC",
            new { UserId = userId });

        return rows.Select(x => (
            new Raffle
            {
                Id = x.Id, Name = x.Name, RaffleType = x.RaffleType,
                PrizeDescription = x.PrizeDescription, PrizeValue = x.PrizeValue,
                DrawDate = x.DrawDate, Status = x.Status,
            },
            x.Tickets)).ToList();
    }

    /* ── Ganadores ───────────────────────────────────────────────────── */

    public async Task<List<RaffleWinner>> GetWinnersAsync(Guid raffleId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<RaffleWinner>(@"
            SELECT * FROM rewards.RaffleWinners
            WHERE RaffleId = @RaffleId ORDER BY PrizeRank",
            new { RaffleId = raffleId });
        return rows.ToList();
    }

    public async Task<List<RaffleWinner>> GetWinnersByUserAsync(Guid userId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<RaffleWinner>(@"
            SELECT * FROM rewards.RaffleWinners
            WHERE UserId = @UserId ORDER BY CreatedAt DESC",
            new { UserId = userId });
        return rows.ToList();
    }

    /// <summary>
    /// Guarda el resultado del sorteo: los ganadores y el estado del sorteo,
    /// en una sola transacción. Si algo falla, no queda un sorteo marcado como
    /// sorteado pero sin ganadores.
    /// </summary>
    public async Task SaveDrawAsync(
        Raffle raffle, IEnumerable<RaffleWinner> winners, CancellationToken ct = default)
    {
        var lista = winners.ToList();

        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            if (lista.Count > 0)
            {
                await _db.ExecuteAsync(@"
                    INSERT INTO rewards.RaffleWinners
                        (Id, RaffleId, UserId, TicketNumber, PrizeRank, PrizeDetail,
                         Status, DeliveredAt, DeliveredBy, Note, CreatedAt)
                    VALUES
                        (@Id, @RaffleId, @UserId, @TicketNumber, @PrizeRank, @PrizeDetail,
                         @Status, @DeliveredAt, @DeliveredBy, @Note, @CreatedAt)
                    ON CONFLICT DO NOTHING",
                    lista, trx);
            }

            await _db.ExecuteAsync(@"
                UPDATE rewards.Raffles SET
                    Status        = @Status,
                    DrawSeed      = @DrawSeed,
                    DrawnAt       = @DrawnAt,
                    TicketsAtDraw = @TicketsAtDraw,
                    UpdatedAt     = @UpdatedAt
                WHERE Id = @Id",
                raffle, trx);

            trx.Commit();
        }
        catch
        {
            trx.Rollback();
            throw;
        }
        finally
        {
            if (wasClosed && _db.State == ConnectionState.Open) _db.Close();
        }
    }

    public Task<RaffleWinner?> GetWinnerByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<RaffleWinner>(
            "SELECT * FROM rewards.RaffleWinners WHERE Id = @Id", new { Id = id });

    public Task UpdateWinnerAsync(RaffleWinner w, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.RaffleWinners SET
                Status      = @Status,
                DeliveredAt = @DeliveredAt,
                DeliveredBy = @DeliveredBy,
                Note        = @Note
            WHERE Id = @Id",
            w);
}
