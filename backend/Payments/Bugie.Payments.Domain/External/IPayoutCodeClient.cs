namespace Bugie.Payments.Domain.External;

/// <summary>
/// Lo que hay detrás de un código de cobro (canje BG-... o premio PZ-...).
/// Viene de Rewards, que es dueño de los canjes y los sorteos.
/// </summary>
public class PayoutCodeInfo
{
    /// <summary>reward_redemption | raffle_prize</summary>
    public string    Kind        { get; set; } = "";
    public string    Code        { get; set; } = "";
    public Guid?     WinnerId    { get; set; }
    public Guid      UserId      { get; set; }
    public string?   UserName    { get; set; }
    public string?   UserRole    { get; set; }
    public string    Title       { get; set; } = "";
    public string?   Detail      { get; set; }
    public decimal?  Amount      { get; set; }
    public string    Status      { get; set; } = "";
    public string    StatusLabel { get; set; } = "";
    public bool      Payable     { get; set; }
    public string?   Reason      { get; set; }
    public DateTime? ExpiresAt   { get; set; }
    public DateTime? SettledAt   { get; set; }
    public DateTime  CreatedAt   { get; set; }
}

/// <summary>Consulta y cierra códigos de cobro en Rewards.</summary>
public interface IPayoutCodeClient
{
    /// <summary>null si el código no existe. Lanza si Rewards no responde.</summary>
    Task<PayoutCodeInfo?> LookupAsync(string code, CancellationToken ct = default);

    /// <summary>Marca el canje como usado o el premio como entregado. Devuelve el error, o null si salió bien.</summary>
    Task<string?> SettleAsync(string code, Guid adminId, string? note, CancellationToken ct = default);
}
