namespace Bugie.Payments.Domain.Entities;

/// <summary>
/// Movimiento de la billetera del conductor (tabla payments.wallettransactions).
///   comision      -> un viaje genero comision: el conductor la debe (baja el saldo).
///   pago_comision -> el admin registro que el conductor pago comision (sube el saldo).
/// Amount siempre es positivo; el tipo dice si suma o resta.
/// </summary>
public class WalletTransaction
{
    public const string TypeCommission        = "comision";
    public const string TypeCommissionPayment = "pago_comision";

    public long      Id              { get; private set; }
    public Guid      DriverId        { get; private set; }
    public string    Type            { get; private set; } = "";
    public decimal   Amount          { get; private set; }
    public string?   Reference       { get; private set; }
    /// <summary>Saldo de la billetera despues de este movimiento.</summary>
    public decimal   BalanceAfter    { get; private set; }

    // Solo en 'comision'
    public Guid?     TripId          { get; private set; }
    public decimal?  TripAmount      { get; private set; }

    // Solo en 'pago_comision'
    /// <summary>yape | plin | transferencia | efectivo</summary>
    public string?   Method          { get; private set; }
    public string?   OperationNumber { get; private set; }
    public string?   Note            { get; private set; }
    public DateTime? PaidAt          { get; private set; }
    public Guid?     AdminId         { get; private set; }
    public string?   AdminName       { get; private set; }

    public DateTime  CreatedAt       { get; private set; }

    private WalletTransaction() { }

    /// <summary>Comision generada por un viaje.</summary>
    public static WalletTransaction Commission(Guid driverId, Guid tripId, decimal tripAmount, decimal fee) => new()
    {
        DriverId   = driverId,
        Type       = TypeCommission,
        Amount     = fee,
        Reference  = "Comision del viaje",
        TripId     = tripId,
        TripAmount = tripAmount,
        CreatedAt  = DateTime.UtcNow,
    };

    /// <summary>Pago de comision que el conductor hizo a Bugie.</summary>
    public static WalletTransaction CommissionPayment(
        Guid driverId, decimal amount, string method, string? operationNumber,
        string? note, DateTime paidAt, Guid adminId, string? adminName) => new()
    {
        DriverId        = driverId,
        Type            = TypeCommissionPayment,
        Amount          = amount,
        Reference       = "Pago de comision",
        Method          = method,
        OperationNumber = operationNumber,
        Note            = note,
        PaidAt          = paidAt,
        AdminId         = adminId,
        AdminName       = adminName,
        CreatedAt       = DateTime.UtcNow,
    };

    /// <summary>Lo pone el repositorio con el saldo ya actualizado.</summary>
    public void SetBalanceAfter(decimal balance) => BalanceAfter = balance;
    public void SetId(long id) => Id = id;
}
