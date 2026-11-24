using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Infrastructure.Repositories;

/// <summary>
/// INSERT del libro de puntos con el saldo REAL leido dentro de la transaccion
/// (fila del perfil bloqueada), no con el que el movimiento traia de memoria.
/// Lo comparten la acreditacion y la devolucion de canjes.
/// </summary>
internal static class LedgerSql
{
    public const string InsertMovement = @"
        INSERT INTO rewards.PointsTransactions
            (Id, ProfileId, Type, Points, SourceEvent, ReferenceId,
             BalanceBefore, BalanceAfter, ExpiryDate, Notes, CreatedAt)
        VALUES
            (@Id, @ProfileId, @Type, @Points, @SourceEvent, @ReferenceId,
             @BalanceBefore, @BalanceAfter, @ExpiryDate, @Notes, @CreatedAt)";

    public static object MovementParams(PointsTransaction m, int balanceBefore, int balanceAfter) => new
    {
        m.Id,
        m.ProfileId,
        m.Type,
        m.Points,
        m.SourceEvent,
        m.ReferenceId,
        BalanceBefore = balanceBefore,
        BalanceAfter  = balanceAfter,
        m.ExpiryDate,
        m.Notes,
        m.CreatedAt,
    };
}
