using System.Data;
using Dapper;
using Bugie.Rewards.Domain.Constants;
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

    public async Task<PointsProfile> GetOrAddAsync(PointsProfile candidate, CancellationToken ct = default)
    {
        await _db.ExecuteAsync(@"
            INSERT INTO rewards.PointsProfiles
                (Id, UserId, UserType, TotalPoints, AvailablePoints, RedeemedPoints,
                 CurrentLevel, PointsExpiryDate, LastActivityDate,
                 ExpiryWarningSentFor, ExpiryWarningLastMilestone, CreatedAt, UpdatedAt)
            VALUES
                (@Id, @UserId, @UserType, @TotalPoints, @AvailablePoints, @RedeemedPoints,
                 @CurrentLevel, @PointsExpiryDate, @LastActivityDate,
                 @ExpiryWarningSentFor, @ExpiryWarningLastMilestone, @CreatedAt, @UpdatedAt)
            ON CONFLICT (UserId) DO NOTHING",
            candidate);

        return await GetByUserIdAsync(candidate.UserId, ct)
            ?? throw new InvalidOperationException("No se pudo crear el perfil de puntos.");
    }

    public Task UpdateUserTypeAsync(PointsProfile profile, CancellationToken ct = default) =>
        _db.ExecuteAsync(@"
            UPDATE rewards.PointsProfiles
            SET UserType = @UserType, UpdatedAt = @UpdatedAt
            WHERE Id = @Id",
            new { profile.Id, profile.UserType, profile.UpdatedAt });

    /// <summary>
    /// Inserta el movimiento y suma el saldo en una sola transaccion.
    ///
    /// El ON CONFLICT DO NOTHING se apoya en el indice unico
    /// UQ_PointsTransactions_Source_Ref: si el mismo viaje ya se acredito a este
    /// perfil, el INSERT no hace nada, devolvemos false y el saldo queda intacto.
    /// </summary>
    public Task<bool> ApplyEarnAsync(
        PointsProfile profile, PointsTransaction transaction, CancellationToken ct = default) =>
        EarnAsync(profile, transaction, award: null);

    public Task<bool> ApplyMilestoneAsync(
        PointsProfile profile, PointsTransaction transaction, MilestoneAward award,
        CancellationToken ct = default) =>
        EarnAsync(profile, transaction, award);

    /// <summary>Saldo real de la fila del perfil.</summary>
    private sealed class BalanceRow
    {
        public int    TotalPoints     { get; set; }
        public int    AvailablePoints { get; set; }
        public int    RedeemedPoints  { get; set; }
        public string CurrentLevel    { get; set; } = string.Empty;
    }

    /// <summary>
    /// Acreditacion atomica:
    ///   1. bloquea la fila del perfil (FOR UPDATE): cualquier otra escritura
    ///      de saldo del mismo usuario espera a que esta termine;
    ///   2. (logros) registra el logro; si ya estaba, no se acredita nada;
    ///   3. inserta el movimiento con el saldo REAL antes y despues;
    ///   4. suma el saldo en la base (saldo = saldo + puntos), sin pisar lo que
    ///      otra operacion haya escrito. El nivel solo sube.
    /// </summary>
    private async Task<bool> EarnAsync(
        PointsProfile profile, PointsTransaction transaction, MilestoneAward? award)
    {
        var wasClosed = _db.State != ConnectionState.Open;
        if (wasClosed) _db.Open();

        BalanceRow saldo;
        using (var trx = _db.BeginTransaction())
        {
            try
            {
                var actual = await _db.QuerySingleAsync<BalanceRow>(@"
                    SELECT TotalPoints, AvailablePoints, RedeemedPoints, CurrentLevel
                    FROM rewards.PointsProfiles
                    WHERE Id = @Id
                    FOR UPDATE",
                    new { profile.Id }, trx);

                if (award is not null)
                {
                    award.ProfileId = profile.Id;
                    var awarded = await _db.ExecuteAsync(@"
                        INSERT INTO rewards.MilestoneAwards
                            (ProfileId, Type, PeriodKey, Points, Detail, CreatedAt)
                        VALUES
                            (@ProfileId, @Type, @PeriodKey, @Points, @Detail, now())
                        ON CONFLICT (ProfileId, Type, PeriodKey) DO NOTHING",
                        award, trx);

                    if (awarded == 0)
                    {
                        // Ya se pago ese periodo.
                        trx.Rollback();
                        return false;
                    }
                }

                var inserted = await _db.ExecuteAsync(
                    LedgerSql.InsertMovement + " ON CONFLICT DO NOTHING",
                    LedgerSql.MovementParams(transaction,
                        balanceBefore: actual.AvailablePoints,
                        balanceAfter:  actual.AvailablePoints + transaction.Points),
                    trx);

                if (inserted == 0)
                {
                    // Evento repetido: no acreditamos dos veces.
                    trx.Rollback();
                    return false;
                }

                saldo = await _db.QuerySingleAsync<BalanceRow>(@"
                    UPDATE rewards.PointsProfiles SET
                        TotalPoints      = TotalPoints     + @Points,
                        AvailablePoints  = AvailablePoints + @Points,
                        CurrentLevel     = @CurrentLevel,
                        PointsExpiryDate = @PointsExpiryDate,
                        LastActivityDate = @LastActivityDate,
                        UpdatedAt        = @UpdatedAt
                    WHERE Id = @Id
                    RETURNING TotalPoints, AvailablePoints, RedeemedPoints, CurrentLevel",
                    new
                    {
                        profile.Id,
                        transaction.Points,
                        CurrentLevel = LevelOrder.Higher(actual.CurrentLevel, profile.CurrentLevel),
                        profile.PointsExpiryDate,
                        profile.LastActivityDate,
                        profile.UpdatedAt,
                    }, trx);

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

        profile.SyncBalances(saldo.TotalPoints, saldo.AvailablePoints, saldo.RedeemedPoints, saldo.CurrentLevel);
        return true;
    }

    public async Task<List<PointsProfile>> GetExpiredAsync(
        int limit, CancellationToken ct = default)
    {
        var rows = await _db.QueryAsync<PointsProfile>(@"
            SELECT * FROM rewards.PointsProfiles
            WHERE AvailablePoints > 0
              AND PointsExpiryDate IS NOT NULL
              AND PointsExpiryDate < now()
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
              AND PointsExpiryDate > now()
              AND PointsExpiryDate <= now() + (@Days * INTERVAL '1 day')
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
                    (@ProfileId, @TransactionId, @Points, @Reason, @AdminId, now())",
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
                  AND PointsExpiryDate < now()",
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
