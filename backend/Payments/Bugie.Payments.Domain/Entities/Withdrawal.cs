namespace Bugie.Payments.Domain.Entities;

/// <summary>
/// Pago hecho a un conductor (tabla payments.withdrawals).
/// Lo registra el admin cuando ya pago: un bono canjeado con puntos,
/// un premio de sorteo o un pago manual. Queda como constancia y para reportes.
/// </summary>
public class Withdrawal
{
    public Guid      Id              { get; private set; }
    /// <summary>Id de usuario (auth.users) de quien recibe el pago.</summary>
    public Guid      DriverId        { get; private set; }
    public string?   DriverName      { get; private set; }
    public decimal   Amount          { get; private set; }
    /// <summary>yape | plin | transferencia | efectivo</summary>
    public string    Method          { get; private set; } = "";
    /// <summary>Numero/cuenta de destino (opcional).</summary>
    public string?   AccountRef      { get; private set; }
    public string?   OperationNumber { get; private set; }
    public string    Status          { get; private set; } = "pending";
    public DateTime? PaidAt          { get; private set; }
    public Guid?     PaidByAdminId   { get; private set; }
    public string?   PaidByAdminName { get; private set; }
    public string?   Note            { get; private set; }
    /// <summary>reward_redemption | raffle_prize | manual</summary>
    public string    SourceType      { get; private set; } = "manual";
    /// <summary>Codigo del canje o id del ganador del sorteo.</summary>
    public string?   SourceRef       { get; private set; }
    public DateTime? ProcessedAt     { get; private set; }
    public DateTime  CreatedAt       { get; private set; }

    private Withdrawal() { }

    /// <summary>Registra un pago ya realizado por el admin.</summary>
    public static Withdrawal CreatePaid(
        Guid driverId, string? driverName, decimal amount, string method,
        string? accountRef, string? operationNumber, DateTime paidAtUtc,
        Guid adminId, string? adminName, string? note,
        string sourceType, string? sourceRef) => new()
    {
        Id              = Guid.NewGuid(),
        DriverId        = driverId,
        DriverName      = driverName,
        Amount          = amount,
        Method          = method,
        AccountRef      = accountRef,
        OperationNumber = operationNumber,
        Status          = "completed",
        PaidAt          = paidAtUtc,
        PaidByAdminId   = adminId,
        PaidByAdminName = adminName,
        Note            = note,
        SourceType      = sourceType,
        SourceRef       = sourceRef,
        ProcessedAt     = DateTime.UtcNow,
        CreatedAt       = DateTime.UtcNow,
    };
}
