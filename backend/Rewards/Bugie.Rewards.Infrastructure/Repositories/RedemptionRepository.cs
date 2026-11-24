using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class RedemptionRepository : IRedemptionRepository
{
    private readonly IDbConnection _db;
    public RedemptionRepository(IDbConnection db) => _db = db;

    // ------------------------------------------------------------------------
    // Canje: cuatro operaciones, una sola transaccion.
    // ------------------------------------------------------------------------
    public async Task<bool> ApplyRedemptionAsync(
        PointsProfile profile, PointsTransaction movement,
        Redemption redemption, bool decrementStock,
        CancellationToken ct = default)
    {
        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            // 1. Descontar puntos.
            //
            //    El WHERE exige que el saldo siga siendo el que leimos antes de
            //    descontar (BalanceBefore del movimiento). Si otra peticion del
            //    mismo usuario se adelanto, el saldo cambio, el UPDATE afecta
            //    0 filas y abortamos. Asi un doble clic no cobra dos veces.
            var updated = await _db.ExecuteAsync(@"
                UPDATE rewards.PointsProfiles SET
                    AvailablePoints = @AvailablePoints,
                    RedeemedPoints  = @RedeemedPoints,
                    CurrentLevel    = @CurrentLevel,
                    UpdatedAt       = @UpdatedAt
                WHERE Id = @Id
                  AND AvailablePoints = @ExpectedBalance",
                new
                {
                    profile.Id,
                    profile.AvailablePoints,
                    profile.RedeemedPoints,
                    profile.CurrentLevel,
                    profile.UpdatedAt,
                    ExpectedBalance = movement.BalanceBefore
                }, trx);

            if (updated == 0)
            {
                trx.Rollback();
                return false;
            }

            // 2. Descontar stock, si el item lleva control de stock.
            //    El WHERE Stock > 0 evita vender la ultima unidad dos veces.
            if (decrementStock)
            {
                var stockUpdated = await _db.ExecuteAsync(@"
                    UPDATE rewards.CatalogItems
                    SET Stock = Stock - 1, UpdatedAt = now()
                    WHERE Id = @Id AND Stock IS NOT NULL AND Stock > 0",
                    new { Id = redemption.CatalogItemId }, trx);

                if (stockUpdated == 0)
                {
                    trx.Rollback();
                    return false;
                }
            }

            // 3. Registrar el movimiento en el libro.
            await _db.ExecuteAsync(InsertTransactionSql, movement, trx);

            // 4. Crear el cupon.
            await _db.ExecuteAsync(@"
                INSERT INTO rewards.Redemptions
                    (Id, ProfileId, UserId, CatalogItemId, Code, ItemName,
                     PointsSpent, RewardType, AmountSoles, Quantity, Percentage,
                     Status, ExpiresAt, UsedAt, UsedReferenceId, UsedNote, CreatedAt)
                VALUES
                    (@Id, @ProfileId, @UserId, @CatalogItemId, @Code, @ItemName,
                     @PointsSpent, @RewardType, @AmountSoles, @Quantity, @Percentage,
                     @Status, @ExpiresAt, @UsedAt, @UsedReferenceId, @UsedNote, @CreatedAt)",
                redemption, trx);

            trx.Commit();
            return true;
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

    // ------------------------------------------------------------------------
    // Anulacion: devolver puntos y marcar el cupon, tambien en una transaccion.
    // ------------------------------------------------------------------------
    public async Task<bool> ApplyRefundAsync(
        PointsProfile profile, PointsTransaction movement,
        Redemption redemption, CancellationToken ct = default)
    {
        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            // Solo devolvemos si el cupon sigue sin usarse. Si alguien lo uso
            // entre medio, el UPDATE no afecta filas y no devolvemos nada.
            var couponUpdated = await _db.ExecuteAsync(@"
                UPDATE rewards.Redemptions
                SET Status = @Status, UsedNote = @UsedNote
                WHERE Id = @Id AND Status = 'active'",
                new { redemption.Id, redemption.Status, redemption.UsedNote }, trx);

            if (couponUpdated == 0)
            {
                trx.Rollback();
                return false;
            }

            // Saldo atomico: se bloquea la fila del perfil, el libro guarda el
            // saldo REAL antes/despues y el UPDATE suma en la base. Asi una
            // acreditacion o un canje simultaneos no se pisan con esta devolucion.
            var saldoAntes = await _db.ExecuteScalarAsync<int>(@"
                SELECT AvailablePoints FROM rewards.PointsProfiles
                WHERE Id = @Id FOR UPDATE",
                new { profile.Id }, trx);

            await _db.ExecuteAsync(LedgerSql.InsertMovement,
                LedgerSql.MovementParams(movement, saldoAntes, saldoAntes + movement.Points), trx);

            var saldo = await _db.QuerySingleAsync<RefundBalanceRow>(@"
                UPDATE rewards.PointsProfiles SET
                    AvailablePoints  = AvailablePoints + @Points,
                    RedeemedPoints   = GREATEST(0, RedeemedPoints - @Points),
                    PointsExpiryDate = COALESCE(PointsExpiryDate, @PointsExpiryDate),
                    UpdatedAt        = @UpdatedAt
                WHERE Id = @Id
                RETURNING TotalPoints, AvailablePoints, RedeemedPoints, CurrentLevel",
                new
                {
                    profile.Id,
                    movement.Points,
                    profile.PointsExpiryDate,
                    profile.UpdatedAt
                }, trx);

            // Devolver el stock si el item lo controlaba.
            if (redemption.CatalogItemId is not null)
                await _db.ExecuteAsync(@"
                    UPDATE rewards.CatalogItems
                    SET Stock = Stock + 1, UpdatedAt = now()
                    WHERE Id = @Id AND Stock IS NOT NULL",
                    new { Id = redemption.CatalogItemId }, trx);

            trx.Commit();
            profile.SyncBalances(saldo.TotalPoints, saldo.AvailablePoints, saldo.RedeemedPoints, saldo.CurrentLevel);
            return true;
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

    /// <summary>Saldo real del perfil despues de la devolucion.</summary>
    private sealed class RefundBalanceRow
    {
        public int    TotalPoints     { get; set; }
        public int    AvailablePoints { get; set; }
        public int    RedeemedPoints  { get; set; }
        public string CurrentLevel    { get; set; } = string.Empty;
    }

    private const string InsertTransactionSql = @"
        INSERT INTO rewards.PointsTransactions
            (Id, ProfileId, Type, Points, SourceEvent, ReferenceId,
             BalanceBefore, BalanceAfter, ExpiryDate, Notes, CreatedAt)
        VALUES
            (@Id, @ProfileId, @Type, @Points, @SourceEvent, @ReferenceId,
             @BalanceBefore, @BalanceAfter, @ExpiryDate, @Notes, @CreatedAt)";

    // ------------------------------------------------------------------------
    // Lecturas
    // ------------------------------------------------------------------------
    public async Task<bool> CancelWithoutRefundAsync(
        Redemption redemption, CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            UPDATE rewards.Redemptions
            SET Status = @Status, UsedNote = @UsedNote
            WHERE Id = @Id AND Status = 'active'",
            new { redemption.Id, redemption.Status, redemption.UsedNote }) > 0;

    public async Task<List<Redemption>> GetActiveByTypeAsync(
        Guid userId, string rewardType, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<Redemption>(@"
            SELECT * FROM rewards.Redemptions
            WHERE UserId = @UserId AND RewardType = @RewardType
              AND Status = 'active' AND ExpiresAt > @Now
            ORDER BY ExpiresAt, CreatedAt",
            new { UserId = userId, RewardType = rewardType, Now = DateTime.UtcNow });
        return rows.ToList();
    }

    public Task<Redemption?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Redemption>(
            "SELECT * FROM rewards.Redemptions WHERE Id = @Id", new { Id = id });

    public Task<Redemption?> GetByCodeAsync(string code, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<Redemption>(
            "SELECT * FROM rewards.Redemptions WHERE Code = @Code", new { Code = code });

    public Task UpdateAsync(Redemption redemption, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.Redemptions SET
                Status          = @Status,
                UsedAt          = @UsedAt,
                UsedReferenceId = @UsedReferenceId,
                UsedNote        = @UsedNote
            WHERE Id = @Id",
            redemption);

    public async Task<(List<Redemption> Items, int Total)> GetByUserAsync(
        Guid userId, string? status, int page, int pageSize, CancellationToken ct = default)
    {
        page     = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        var where = string.IsNullOrWhiteSpace(status)
            ? "WHERE UserId = @UserId"
            : "WHERE UserId = @UserId AND Status = @Status";

        var sql = $@"
            SELECT * FROM rewards.Redemptions
            {where}
            ORDER BY CreatedAt DESC
            LIMIT @Take OFFSET @Skip;

            SELECT COUNT(*) FROM rewards.Redemptions {where};";

        using var multi = await _db.QueryMultipleAsync(sql,
            new { UserId = userId, Status = status, Take = pageSize, Skip = skip });

        var items = (await multi.ReadAsync<Redemption>()).ToList();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }

    public async Task<(List<Redemption> Items, int Total)> GetPagedAsync(
        string? status, string? userType, int page, int pageSize, CancellationToken ct = default)
    {
        page     = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        var conditions = new List<string>();
        if (!string.IsNullOrWhiteSpace(status))   conditions.Add("r.Status = @Status");
        if (!string.IsNullOrWhiteSpace(userType)) conditions.Add("p.UserType = @UserType");
        var where = conditions.Count == 0 ? "" : "WHERE " + string.Join(" AND ", conditions);

        var sql = $@"
            SELECT r.* FROM rewards.Redemptions r
            JOIN rewards.PointsProfiles p ON p.Id = r.ProfileId
            {where}
            ORDER BY r.CreatedAt DESC
            LIMIT @Take OFFSET @Skip;

            SELECT COUNT(*) FROM rewards.Redemptions r
            JOIN rewards.PointsProfiles p ON p.Id = r.ProfileId
            {where};";

        using var multi = await _db.QueryMultipleAsync(sql,
            new { Status = status, UserType = userType, Take = pageSize, Skip = skip });

        var items = (await multi.ReadAsync<Redemption>()).ToList();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }

    /// <summary>
    /// Vence los cupones que pasaron su fecha. No devuelve puntos: el usuario
    /// ya los gasto al canjear, igual que un cupon de papel que se vence.
    /// </summary>
    // Los 'reserved' no se tocan: estan aplicados a un viaje que sigue activo.
    public async Task<int> ExpireOverdueAsync(CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            UPDATE rewards.Redemptions
            SET Status = 'expired'
            WHERE Status = 'active' AND ExpiresAt < now()");

    // ------------------------------------------------------------------------
    // Reserva del cupon en un viaje. Cada cambio es un UPDATE condicionado al
    // estado: si dos peticiones llegan a la vez, solo una afecta la fila.
    // ------------------------------------------------------------------------
    public async Task<bool> TryReserveAsync(
        Guid redemptionId, Guid userId, Guid tripId, CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            UPDATE rewards.Redemptions
               SET Status = 'reserved', ReservedTripId = @TripId, ReservedAt = now()
             WHERE Id = @Id AND UserId = @UserId
               AND ((Status = 'active' AND ExpiresAt > now())
                 OR (Status = 'reserved' AND ReservedTripId = @TripId))",
            new { Id = redemptionId, UserId = userId, TripId = tripId }) > 0;

    public Task<string?> ReleaseAsync(
        string code, Guid tripId, DateTime? requestedAtUtc, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<string?>(@"
            UPDATE rewards.Redemptions
               SET Status = CASE WHEN ExpiresAt > now() THEN 'active' ELSE 'expired' END,
                   ReservedTripId = NULL, ReservedAt = NULL
             WHERE Code = @Code AND Status = 'reserved' AND ReservedTripId = @TripId
               AND (@RequestedAt::timestamptz IS NULL OR ReservedAt <= @RequestedAt::timestamptz)
            RETURNING Status",
            new
            {
                Code        = code,
                TripId      = tripId,
                RequestedAt = requestedAtUtc is null
                    ? (DateTime?)null
                    : DateTime.SpecifyKind(requestedAtUtc.Value, DateTimeKind.Utc),
            });

    public async Task<bool> TryConsumeForTripAsync(
        Guid redemptionId, Guid tripId, string note, CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            UPDATE rewards.Redemptions
               SET Status = 'used', UsedAt = now(), UsedReferenceId = @TripId, UsedNote = @Note
             WHERE Id = @Id
               AND ((Status = 'reserved' AND ReservedTripId = @TripId)
                 OR (Status = 'active' AND ExpiresAt > now()))",
            new { Id = redemptionId, TripId = tripId, Note = note }) > 0;

    // Las dos redes de seguridad leen trips.Trips (misma base, igual que
    // AdminQueryRepository). Status del viaje: 4 = completado, 5 = cancelado.
    public async Task<int> ReleaseOrphanReservationsAsync(int graceMinutes, CancellationToken ct = default) =>
        await _db.ExecuteAsync(@"
            UPDATE rewards.Redemptions r
               SET Status = CASE WHEN r.ExpiresAt > now() THEN 'active' ELSE 'expired' END,
                   ReservedTripId = NULL, ReservedAt = NULL
             WHERE r.Status = 'reserved'
               AND r.ReservedAt < now() - make_interval(mins => @Grace)
               AND NOT EXISTS (
                   SELECT 1 FROM trips.Trips t
                    WHERE t.Id = r.ReservedTripId
                      AND t.Status <> 5
                      AND upper(t.CouponCode) = upper(r.Code))",
            new { Grace = graceMinutes });

    public async Task<List<PendingTripCoupon>> GetUnconsumedCompletedAsync(
        int graceMinutes, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<PendingTripCoupon>(@"
            SELECT r.Code, t.Id AS TripId,
                   GREATEST(t.EstimatedFare - COALESCE(t.FinalFare, t.EstimatedFare), 0) AS AppliedDiscount
              FROM rewards.Redemptions r
              JOIN trips.Trips t ON t.Id = r.ReservedTripId
             WHERE r.Status = 'reserved'
               AND t.Status = 4
               AND upper(t.CouponCode) = upper(r.Code)
               AND t.CompletedAt < now() - make_interval(mins => @Grace)
             LIMIT 100",
            new { Grace = graceMinutes });
        return rows.ToList();
    }
}
