using Bugie.Rewards.Domain.Constants;

namespace Bugie.Rewards.Domain.Entities;

/// <summary>
/// Un canje realizado: el cupon que queda en manos del usuario.
///
/// Los valores (tipo, monto, cantidad) se copian del item al momento del canje.
/// Si el admin despues cambia el catalogo, este cupon conserva lo que se pacto.
/// </summary>
public class Redemption
{
    public Guid      Id              { get; private set; }
    public Guid      ProfileId       { get; private set; }
    public Guid      UserId          { get; private set; }
    public Guid      CatalogItemId   { get; private set; }
    public string    Code            { get; private set; } = string.Empty;
    public string    ItemName        { get; private set; } = string.Empty;
    public int       PointsSpent     { get; private set; }
    public string    RewardType      { get; private set; } = string.Empty;
    public decimal?  AmountSoles     { get; private set; }
    public int?      Quantity        { get; private set; }
    public decimal?  Percentage      { get; private set; }
    public string    Status          { get; private set; } = RedemptionStatus.Active;
    public DateTime  ExpiresAt       { get; private set; }
    public DateTime? UsedAt          { get; private set; }
    public Guid?     UsedReferenceId { get; private set; }
    public string?   UsedNote        { get; private set; }
    public DateTime  CreatedAt       { get; private set; }

    private Redemption() { }

    public static Redemption Create(PointsProfile profile, CatalogItem item)
    {
        var now = DateTime.UtcNow;
        return new Redemption
        {
            Id            = Guid.NewGuid(),
            ProfileId     = profile.Id,
            UserId        = profile.UserId,
            CatalogItemId = item.Id,
            Code          = GenerateCode(),
            ItemName      = item.Name,
            PointsSpent   = item.PointsCost,
            RewardType    = item.RewardType,
            AmountSoles   = item.AmountSoles,
            Quantity      = item.Quantity,
            Percentage    = item.Percentage,
            Status        = RedemptionStatus.Active,
            ExpiresAt     = now.AddDays(item.ValidityDays),
            CreatedAt     = now,
        };
    }

    public bool IsExpired => DateTime.UtcNow > ExpiresAt;

    /// <summary>Se puede usar ahora mismo.</summary>
    public bool IsUsable => Status == RedemptionStatus.Active && !IsExpired;

    public void Use(Guid? referenceId = null, string? note = null)
    {
        if (Status != RedemptionStatus.Active)
            throw new InvalidOperationException($"El cupon ya esta en estado '{Status}'.");
        if (IsExpired)
            throw new InvalidOperationException("El cupon esta vencido.");

        Status          = RedemptionStatus.Used;
        UsedAt          = DateTime.UtcNow;
        UsedReferenceId = referenceId;
        UsedNote        = note;
    }

    public void Cancel(string? note = null)
    {
        if (Status == RedemptionStatus.Used)
            throw new InvalidOperationException("No se puede anular un cupon ya usado.");
        Status   = RedemptionStatus.Cancelled;
        UsedNote = note;
    }

    /// <summary>
    /// Codigo corto y legible: BG-XXXXXX.
    /// Sin 0, O, 1 ni I para que nadie se confunda al dictarlo por telefono.
    /// </summary>
    private static string GenerateCode()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var chars = new char[6];
        var bytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(6);
        for (var i = 0; i < 6; i++)
            chars[i] = alphabet[bytes[i] % alphabet.Length];
        return "BG-" + new string(chars);
    }
}
