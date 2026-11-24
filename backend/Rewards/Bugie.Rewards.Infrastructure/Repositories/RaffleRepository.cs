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
                (Id, Name, RaffleType, PrizeDescription, PrizeValue,
                 SecondaryPrizeDescription, SecondaryPrizeValue, DrawDate,
                 MinLevelRequired, MinMonthsActive, TargetUserType, WinnersCount,
                 Status, DrawSeed, DrawnAt, TicketsAtDraw, CreatedAt, UpdatedAt)
            VALUES
                (@Id, @Name, @RaffleType, @PrizeDescription, @PrizeValue,
                 @SecondaryPrizeDescription, @SecondaryPrizeValue, @DrawDate,
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
                SecondaryPrizeDescription = @SecondaryPrizeDescription,
                SecondaryPrizeValue       = @SecondaryPrizeValue,
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

    private sealed class SourceCount
    {
        public string Source { get; set; } = string.Empty;
        public int    Total  { get; set; }
    }

    public async Task<RaffleTicketsPage> GetTicketsPageAsync(
        Guid raffleId, string? search, int page, int pageSize, CancellationToken ct = default)
    {
        // Nombre y rol salen de auth.users con un JOIN (misma base, igual que
        // AdminQueryRepository): sin una consulta por usuario.
        var texto  = search?.Trim();
        var filtro = string.IsNullOrEmpty(texto)
            ? ""
            : " AND (u.FullName ILIKE @Patron OR t.TicketNumber ILIKE @Patron)";

        var sql = $@"
            SELECT t.TicketNumber, t.UserId,
                   u.FullName AS UserName, u.Role AS UserRole,
                   t.Source, t.CreatedAt,
                   EXISTS (SELECT 1 FROM rewards.RaffleWinners w
                           WHERE w.RaffleId = t.RaffleId
                             AND w.TicketNumber = t.TicketNumber) AS IsWinner
            FROM rewards.RaffleTickets t
            LEFT JOIN auth.Users u ON u.Id = t.UserId
            WHERE t.RaffleId = @RaffleId{filtro}
            ORDER BY IsWinner DESC, t.TicketNumber
            LIMIT @Take OFFSET @Skip;

            SELECT COUNT(*)::int
            FROM rewards.RaffleTickets t
            LEFT JOIN auth.Users u ON u.Id = t.UserId
            WHERE t.RaffleId = @RaffleId{filtro};

            SELECT COUNT(DISTINCT UserId)::int
            FROM rewards.RaffleTickets WHERE RaffleId = @RaffleId;

            SELECT Source, COUNT(*)::int AS Total
            FROM rewards.RaffleTickets WHERE RaffleId = @RaffleId
            GROUP BY Source;";

        using var multi = await _db.QueryMultipleAsync(new CommandDefinition(sql, new
        {
            RaffleId = raffleId,
            Patron   = $"%{texto}%",
            Take     = pageSize,
            Skip     = (page - 1) * pageSize,
        }, cancellationToken: ct));

        var items        = (await multi.ReadAsync<RaffleTicketAdminRow>()).ToList();
        var total        = await multi.ReadSingleAsync<int>();
        var participants = await multi.ReadSingleAsync<int>();
        var bySource     = (await multi.ReadAsync<SourceCount>())
                           .ToDictionary(s => s.Source, s => s.Total);

        return new RaffleTicketsPage(items, total, participants, bySource);
    }

    public Task<int> CountUserTicketsAsync(
        Guid raffleId, Guid userId, string? source, CancellationToken ct = default)
    {
        var filtro = source is null ? "" : " AND Source = @Source";
        return _db.ExecuteScalarAsync<int>($@"
            SELECT COUNT(*) FROM rewards.RaffleTickets
            WHERE RaffleId = @RaffleId AND UserId = @UserId{filtro}",
            new { RaffleId = raffleId, UserId = userId, Source = source });
    }

    private sealed class UserSourceCount
    {
        public Guid   UserId { get; set; }
        public string Source { get; set; } = string.Empty;
        public int    Total  { get; set; }
    }

    public async Task<Dictionary<(Guid UserId, string Source), int>> CountTicketsByUserAsync(
        Guid raffleId, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<UserSourceCount>(@"
            SELECT UserId, Source, COUNT(*)::int AS Total
            FROM rewards.RaffleTickets
            WHERE RaffleId = @RaffleId
            GROUP BY UserId, Source",
            new { RaffleId = raffleId });
        return rows.ToDictionary(r => (r.UserId, r.Source), r => r.Total);
    }

    /// <summary>
    /// Completa los tickets del usuario hasta el objetivo, numerados de forma
    /// correlativa dentro del sorteo.
    ///
    /// Se bloquea la fila del sorteo mientras se cuenta y se numera. Sin ese
    /// bloqueo, dos procesos simultáneos leerían lo mismo y entregarían dos
    /// veces (el índice único incluye el número de ticket, así que no lo
    /// impediría), o chocarían con el mismo número.
    /// </summary>
    public async Task<int> GrantMissingTicketsAsync(
        Guid raffleId, Guid userId, Guid profileId, int target,
        string source, CancellationToken ct = default)
    {
        if (target <= 0) return 0;

        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            // Bloquea el sorteo; solo se reparte mientras siga abierto.
            // (FOR UPDATE no admite COUNT; si no hay fila, Dapper devuelve 0)
            var abierto = await _db.ExecuteScalarAsync<int>(
                "SELECT 1 FROM rewards.Raffles WHERE Id = @Id AND Status = 'open' FOR UPDATE",
                new { Id = raffleId }, trx);

            if (abierto == 0) { trx.Rollback(); return 0; }

            // Lo que ya tiene, contado con el bloqueo tomado.
            var yaTiene = await _db.ExecuteScalarAsync<int>(@"
                SELECT COUNT(*) FROM rewards.RaffleTickets
                WHERE RaffleId = @RaffleId AND UserId = @UserId AND Source = @Source",
                new { RaffleId = raffleId, UserId = userId, Source = source }, trx);

            var quantity = target - yaTiene;
            if (quantity <= 0) { trx.Rollback(); return 0; }

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
                ReferenceId  = (Guid?)null,
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

    public async Task<List<string>> UseTicketCouponAsync(
        Guid raffleId, Guid userId, Guid profileId, Guid redemptionId,
        int quantity, string usedNote, CancellationToken ct = default)
    {
        var vacio = new List<string>();
        if (quantity <= 0) return vacio;

        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            var now = DateTime.UtcNow;

            // 1. Bloquea el sorteo (numeracion sin carreras) y exige que siga
            //    abierto y que su fecha no haya llegado.
            var abierto = await _db.ExecuteScalarAsync<int>(@"
                SELECT 1 FROM rewards.Raffles
                WHERE Id = @Id AND Status = 'open' AND DrawDate > @Now
                FOR UPDATE",
                new { Id = raffleId, Now = now }, trx);

            if (abierto == 0) { trx.Rollback(); return vacio; }

            // 2. Marca el cupon como usado. El WHERE evita usarlo dos veces
            //    (doble clic) o usar uno ajeno, vencido o de otro tipo.
            var usado = await _db.ExecuteAsync(@"
                UPDATE rewards.Redemptions SET
                    Status          = 'used',
                    UsedAt          = @Now,
                    UsedReferenceId = @RaffleId,
                    UsedNote        = @Note
                WHERE Id = @Id AND UserId = @UserId
                  AND RewardType = 'raffle_ticket'
                  AND Status = 'active' AND ExpiresAt > @Now",
                new { Id = redemptionId, UserId = userId, RaffleId = raffleId, Note = usedNote, Now = now }, trx);

            if (usado == 0) { trx.Rollback(); return vacio; }

            // 3. Crea los tickets con la misma numeracion que el reparto.
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
                Source       = TicketSources.PointsRedemption,
                ReferenceId  = (Guid?)redemptionId,
            }).ToList();

            await _db.ExecuteAsync(@"
                INSERT INTO rewards.RaffleTickets
                    (Id, RaffleId, UserId, ProfileId, TicketNumber, Source, ReferenceId, CreatedAt)
                VALUES
                    (@Id, @RaffleId, @UserId, @ProfileId, @TicketNumber, @Source, @ReferenceId, now())",
                filas, trx);

            trx.Commit();
            return filas.Select(f => f.TicketNumber).ToList();
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
    /// Ejecuta y guarda el sorteo en una sola transacción, con el sorteo
    /// bloqueado. Si algo falla, no queda un sorteo marcado como sorteado pero
    /// sin ganadores; y si otro proceso ya lo sorteó (o se canceló), no se
    /// vuelve a sortear.
    /// </summary>
    public async Task<RaffleDrawResult> DrawAsync(
        Guid raffleId,
        Func<Raffle, IReadOnlyList<RaffleTicket>, List<RaffleWinner>> pickWinners,
        bool cancelIfNoTickets,
        CancellationToken ct = default)
    {
        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            // 1. Bloquea el sorteo. Un segundo "sortear" espera aquí y, cuando
            //    el primero confirma, ya lo ve 'drawn'.
            var raffle = await _db.QuerySingleOrDefaultAsync<Raffle>(
                "SELECT * FROM rewards.Raffles WHERE Id = @Id FOR UPDATE",
                new { Id = raffleId }, trx);

            if (raffle is null)
            {
                trx.Rollback();
                return new RaffleDrawResult(RaffleDrawOutcome.NotFound, null, 0, new List<RaffleWinner>());
            }
            if (!raffle.IsPendingDraw)
            {
                trx.Rollback();
                return new RaffleDrawResult(RaffleDrawOutcome.NotPending, raffle, raffle.TicketsAtDraw ?? 0, new List<RaffleWinner>());
            }

            // 2. Tickets leídos con el bloqueo tomado: nadie agrega tickets
            //    mientras se sortea (el reparto también bloquea el sorteo).
            var tickets = (await _db.QueryAsync<RaffleTicket>(@"
                SELECT * FROM rewards.RaffleTickets
                WHERE RaffleId = @RaffleId
                ORDER BY TicketNumber",
                new { RaffleId = raffleId }, trx)).ToList();

            if (tickets.Count == 0)
            {
                if (cancelIfNoTickets)
                {
                    raffle.Status    = RaffleStatus.Cancelled;
                    raffle.UpdatedAt = DateTime.UtcNow;
                    await _db.ExecuteAsync(@"
                        UPDATE rewards.Raffles SET Status = @Status, UpdatedAt = @UpdatedAt
                        WHERE Id = @Id AND Status IN ('open','closed')",
                        raffle, trx);
                    trx.Commit();
                }
                else trx.Rollback();
                return new RaffleDrawResult(RaffleDrawOutcome.NoTickets, raffle, 0, new List<RaffleWinner>());
            }

            // 3. Ganadores (lógica pura) y marcas del sorteo.
            var lista = pickWinners(raffle, tickets);

            if (lista.Count > 0)
            {
                await _db.ExecuteAsync(@"
                    INSERT INTO rewards.RaffleWinners
                        (Id, RaffleId, UserId, TicketNumber, PrizeRank, PrizeDetail, PrizeValue,
                         Status, DeliveredAt, DeliveredBy, Note, CreatedAt)
                    VALUES
                        (@Id, @RaffleId, @UserId, @TicketNumber, @PrizeRank, @PrizeDetail, @PrizeValue,
                         @Status, @DeliveredAt, @DeliveredBy, @Note, @CreatedAt)",
                    lista, trx);
            }

            // 4. El WHERE de estado es una segunda barrera: si no afecta la
            //    fila, se deshace todo (incluidos los ganadores).
            var marcado = await _db.ExecuteAsync(@"
                UPDATE rewards.Raffles SET
                    Status        = @Status,
                    DrawSeed      = @DrawSeed,
                    DrawnAt       = @DrawnAt,
                    TicketsAtDraw = @TicketsAtDraw,
                    UpdatedAt     = @UpdatedAt
                WHERE Id = @Id AND Status IN ('open','closed')",
                raffle, trx);

            if (marcado == 0)
            {
                trx.Rollback();
                return new RaffleDrawResult(RaffleDrawOutcome.NotPending, raffle, tickets.Count, new List<RaffleWinner>());
            }

            trx.Commit();
            return new RaffleDrawResult(RaffleDrawOutcome.Drawn, raffle, tickets.Count, lista);
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

    public Task<RaffleWinner?> GetWinnerByPrizeCodeAsync(string prizeCode, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<RaffleWinner>(
            "SELECT * FROM rewards.RaffleWinners WHERE PrizeCode = @Code", new { Code = prizeCode });

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
