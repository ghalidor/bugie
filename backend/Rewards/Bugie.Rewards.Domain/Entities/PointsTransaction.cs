using Bugie.Rewards.Domain.Constants;

namespace Bugie.Rewards.Domain.Entities;

/// <summary>
/// Movimiento del libro de puntos. Es inmutable: se inserta y nunca se edita.
/// Cualquier correccion se hace insertando otro movimiento.
/// </summary>
public class PointsTransaction
{
    public Guid      Id            { get; private set; }
    public Guid      ProfileId     { get; private set; }
    public string    Type          { get; private set; } = TransactionTypes.Earn;
    public int       Points        { get; private set; }
    public string    SourceEvent   { get; private set; } = string.Empty;

    /// <summary>Id del viaje, canje o sorteo que origino el movimiento.</summary>
    public Guid?     ReferenceId   { get; private set; }

    public int       BalanceBefore { get; private set; }
    public int       BalanceAfter  { get; private set; }
    public DateTime? ExpiryDate    { get; private set; }
    public string?   Notes         { get; private set; }
    public DateTime  CreatedAt     { get; private set; }

    private PointsTransaction() { }

    public static PointsTransaction Earn(
        Guid profileId, int points, string sourceEvent, Guid? referenceId,
        int balanceBefore, DateTime? expiryDate, string? notes = null) => new()
    {
        Id            = Guid.NewGuid(),
        ProfileId     = profileId,
        Type          = TransactionTypes.Earn,
        Points        = points,
        SourceEvent   = sourceEvent,
        ReferenceId   = referenceId,
        BalanceBefore = balanceBefore,
        BalanceAfter  = balanceBefore + points,
        ExpiryDate    = expiryDate,
        Notes         = notes,
        CreatedAt     = DateTime.UtcNow,
    };

    public static PointsTransaction Redeem(
        Guid profileId, int points, string sourceEvent, Guid? referenceId,
        int balanceBefore, string? notes = null) => new()
    {
        Id            = Guid.NewGuid(),
        ProfileId     = profileId,
        Type          = TransactionTypes.Redeem,
        Points        = points,
        SourceEvent   = sourceEvent,
        ReferenceId   = referenceId,
        BalanceBefore = balanceBefore,
        BalanceAfter  = balanceBefore - points,
        ExpiryDate    = null,
        Notes         = notes,
        CreatedAt     = DateTime.UtcNow,
    };

    /// <summary>Puntos perdidos por vencimiento.</summary>
    public static PointsTransaction Expire(
        Guid profileId, int points, string sourceEvent,
        int balanceBefore, string? notes = null) => new()
    {
        Id            = Guid.NewGuid(),
        ProfileId     = profileId,
        Type          = TransactionTypes.Expire,
        Points        = points,
        SourceEvent   = sourceEvent,
        ReferenceId   = null,
        BalanceBefore = balanceBefore,
        BalanceAfter  = balanceBefore - points,
        ExpiryDate    = null,
        Notes         = notes,
        CreatedAt     = DateTime.UtcNow,
    };

    /// <summary>Devolucion de puntos por un canje anulado.</summary>
    public static PointsTransaction Refund(
        Guid profileId, int points, string sourceEvent, Guid? referenceId,
        int balanceBefore, DateTime? expiryDate, string? notes = null) => new()
    {
        Id            = Guid.NewGuid(),
        ProfileId     = profileId,
        Type          = TransactionTypes.Bonus,
        Points        = points,
        SourceEvent   = sourceEvent,
        ReferenceId   = referenceId,
        BalanceBefore = balanceBefore,
        BalanceAfter  = balanceBefore + points,
        ExpiryDate    = expiryDate,
        Notes         = notes,
        CreatedAt     = DateTime.UtcNow,
    };
}
