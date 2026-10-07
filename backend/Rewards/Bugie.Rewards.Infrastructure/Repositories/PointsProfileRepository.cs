using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Entities;
using Bugie.Rewards.Domain.Interfaces;

namespace Bugie.Rewards.Infrastructure.Repositories;

public class PointsProfileRepository : IPointsProfileRepository
{
    private readonly IDbConnection _db;
    public PointsProfileRepository(IDbConnection db) => _db = db;

    public Task<PointsProfile?> GetByUserIdAsync(Guid userId, CancellationToken ct = default) =>
        _db.QuerySingleOrDefaultAsync<PointsProfile>(
            "SELECT * FROM rewards.PointsProfiles WHERE UserId = @UserId",
            new { UserId = userId });

    public Task AddAsync(PointsProfile profile, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            INSERT INTO rewards.PointsProfiles
                (Id, UserId, UserType, TotalPoints, AvailablePoints, RedeemedPoints,
                 CurrentLevel, PointsExpiryDate, LastActivityDate,
                 ExpiryWarningSentFor, ExpiryWarningLastMilestone, CreatedAt, UpdatedAt)
            VALUES
                (@Id, @UserId, @UserType, @TotalPoints, @AvailablePoints, @RedeemedPoints,
                 @CurrentLevel, @PointsExpiryDate, @LastActivityDate,
                 @ExpiryWarningSentFor, @ExpiryWarningLastMilestone, @CreatedAt, @UpdatedAt)",
            profile);

    /// <summary>
    /// Inserta el movimiento y actualiza el saldo en una sola transaccion.
    ///
    /// El ON CONFLICT DO NOTHING se apoya en el indice unico
    /// UQ_PointsTransactions_Source_Ref: si el mismo viaje ya se acredito a este
    /// perfil, el INSERT no hace nada, devolvemos false y el saldo queda intacto.
    /// </summary>
    public async Task<bool> ApplyEarnAsync(
        PointsProfile profile, PointsTransaction transaction, CancellationToken ct = default)
    {
        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            var inserted = await _db.ExecuteAsync(@"
                INSERT INTO rewards.PointsTransactions
                    (Id, ProfileId, Type, Points, SourceEvent, ReferenceId,
                     BalanceBefore, BalanceAfter, ExpiryDate, Notes, CreatedAt)
                VALUES
                    (@Id, @ProfileId, @Type, @Points, @SourceEvent, @ReferenceId,
                     @BalanceBefore, @BalanceAfter, @ExpiryDate, @Notes, @CreatedAt)
                ON CONFLICT DO NOTHING",
                transaction, trx);

            if (inserted == 0)
            {
                // Evento repetido: no acreditamos dos veces.
                trx.Rollback();
                return false;
            }

            await _db.ExecuteAsync(@"
                UPDATE rewards.PointsProfiles SET
                    TotalPoints      = @TotalPoints,
                    AvailablePoints  = @AvailablePoints,
                    RedeemedPoints   = @RedeemedPoints,
                    CurrentLevel     = @CurrentLevel,
                    PointsExpiryDate = @PointsExpiryDate,
                    LastActivityDate = @LastActivityDate,
                    ExpiryWarningSentFor = @ExpiryWarningSentFor,
                    ExpiryWarningLastMilestone = @ExpiryWarningLastMilestone,
                    UpdatedAt        = @UpdatedAt
                WHERE Id = @Id",
                profile, trx);

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

    public async Task<List<PointsProfile>> GetExpiredAsync(
        int limit, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<PointsProfile>(@"
            SELECT * FROM rewards.PointsProfiles
            WHERE AvailablePoints > 0
              AND PointsExpiryDate IS NOT NULL
              AND PointsExpiryDate < (now() AT TIME ZONE 'utc')
            ORDER BY PointsExpiryDate
            LIMIT @Limit",
            new { Limit = limit });
        return rows.ToList();
    }

    public async Task<List<PointsProfile>> GetPendingWarningAsync(
        int withinDays, int limit, CancellationToken ct = default)
    {
        // Trae a todos los que estan dentro de la ventana mas ancha.
        // Cual hito corresponde, y si ya se aviso, lo decide el dominio:
        // el SQL no deberia saber de reglas de negocio.
        var rows = await _db.QueryAsync<PointsProfile>(@"
            SELECT * FROM rewards.PointsProfiles
            WHERE AvailablePoints > 0
              AND PointsExpiryDate IS NOT NULL
              AND PointsExpiryDate > (now() AT TIME ZONE 'utc')
              AND PointsExpiryDate <= (now() AT TIME ZONE 'utc') + (@Days * INTERVAL '1 day')
            ORDER BY PointsExpiryDate
            LIMIT @Limit",
            new { Days = withinDays, Limit = limit });
        return rows.ToList();
    }

    /// <summary>
    /// Ajuste manual del administrador. Tres escrituras en una transacción:
    /// el saldo del perfil, el movimiento en el libro, y la auditoría de quién
    /// lo hizo y por qué.
    ///
    /// El WHERE exige que el saldo siga siendo el que leímos: si el usuario
    /// ganó o gastó puntos entre medio, el ajuste se rechaza y el admin lo
    /// vuelve a intentar con el saldo correcto. Sin eso, dos ajustes a la vez
    /// se pisarían.
    /// </summary>
    public async Task<bool> ApplyAdjustmentAsync(
        PointsProfile profile, PointsTransaction movement,
        int expectedBalance, string reason, Guid? adminId,
        CancellationToken ct = default)
    {
        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            var updated = await _db.ExecuteAsync(@"
                UPDATE rewards.PointsProfiles SET
                    TotalPoints     = @TotalPoints,
                    AvailablePoints = @AvailablePoints,
                    CurrentLevel    = @CurrentLevel,
                    UpdatedAt       = @UpdatedAt
                WHERE Id = @Id
                  AND AvailablePoints = @ExpectedBalance",
                new
                {
                    profile.Id,
                    profile.TotalPoints,
                    profile.AvailablePoints,
                    profile.CurrentLevel,
                    profile.UpdatedAt,
                    ExpectedBalance = expectedBalance,
                }, trx);

            if (updated == 0)
            {
                // El saldo cambió mientras tanto. Nada se escribe.
                trx.Rollback();
                return false;
            }

            await _db.ExecuteAsync(@"
                INSERT INTO rewards.PointsTransactions
                    (Id, ProfileId, Type, Points, SourceEvent, ReferenceId,
                     BalanceBefore, BalanceAfter, ExpiryDate, Notes, CreatedAt)
                VALUES
                    (@Id, @ProfileId, @Type, @Points, @SourceEvent, @ReferenceId,
                     @BalanceBefore, @BalanceAfter, @ExpiryDate, @Notes, @CreatedAt)",
                movement, trx);

            // El signo del ajuste se guarda acá, donde sí se permite negativo.
            var signo = movement.Type == "adjust_sub" ? -movement.Points : movement.Points;

            await _db.ExecuteAsync(@"
                INSERT INTO rewards.PointsAdjustments
                    (ProfileId, TransactionId, Points, Reason, AdminId, CreatedAt)
                VALUES
                    (@ProfileId, @TransactionId, @Points, @Reason, @AdminId, (now() AT TIME ZONE 'utc'))",
                new
                {
                    ProfileId     = profile.Id,
                    TransactionId = movement.Id,
                    Points        = signo,
                    Reason        = reason,
                    AdminId       = adminId,
                }, trx);

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

    public async Task<bool> ApplyExpirationAsync(
        PointsProfile profile, PointsTransaction movement, CancellationToken ct = default)
    {
        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        using var trx = _db.BeginTransaction();
        try
        {
            // El WHERE exige que el saldo y la fecha sigan siendo los que
            // leimos. Si el usuario gano puntos en el intermedio, su fecha se
            // renovo y no corresponde vencerle nada.
            var updated = await _db.ExecuteAsync(@"
                UPDATE rewards.PointsProfiles SET
                    AvailablePoints      = 0,
                    PointsExpiryDate     = NULL,
                    ExpiryWarningSentFor = NULL,
                    ExpiryWarningLastMilestone = NULL,
                    CurrentLevel         = @CurrentLevel,
                    UpdatedAt            = @UpdatedAt
                WHERE Id = @Id
                  AND AvailablePoints = @ExpectedBalance
                  AND PointsExpiryDate IS NOT NULL
                  AND PointsExpiryDate < (now() AT TIME ZONE 'utc')",
                new
                {
                    profile.Id,
                    profile.CurrentLevel,
                    profile.UpdatedAt,
                    ExpectedBalance = movement.BalanceBefore
                }, trx);

            if (updated == 0)
            {
                trx.Rollback();
                return false;
            }

            await _db.ExecuteAsync(@"
                INSERT INTO rewards.PointsTransactions
                    (Id, ProfileId, Type, Points, SourceEvent, ReferenceId,
                     BalanceBefore, BalanceAfter, ExpiryDate, Notes, CreatedAt)
                VALUES
                    (@Id, @ProfileId, @Type, @Points, @SourceEvent, @ReferenceId,
                     @BalanceBefore, @BalanceAfter, @ExpiryDate, @Notes, @CreatedAt)",
                movement, trx);

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

    public Task MarkWarningSentAsync(PointsProfile profile, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.PointsProfiles
            SET ExpiryWarningSentFor       = @ExpiryWarningSentFor,
                ExpiryWarningLastMilestone = @ExpiryWarningLastMilestone,
                UpdatedAt                  = @UpdatedAt
            WHERE Id = @Id",
            new { profile.Id, profile.ExpiryWarningSentFor,
                  profile.ExpiryWarningLastMilestone, profile.UpdatedAt });

    public async Task<(List<PointsProfile> Items, int Total)> GetPagedAsync(
        int page, int pageSize, string? userType, CancellationToken ct = default)
    {
        page     = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var skip = (page - 1) * pageSize;

        var where = string.IsNullOrWhiteSpace(userType) ? "" : "WHERE UserType = @UserType";

        var sql = $@"
            SELECT * FROM rewards.PointsProfiles
            {where}
            ORDER BY TotalPoints DESC
            LIMIT @Take OFFSET @Skip;

            SELECT COUNT(*) FROM rewards.PointsProfiles {where};";

        using var multi = await _db.QueryMultipleAsync(sql,
            new { UserType = userType, Take = pageSize, Skip = skip });

        var items = (await multi.ReadAsync<PointsProfile>()).ToList();
        var total = await multi.ReadSingleAsync<int>();
        return (items, total);
    }
}
