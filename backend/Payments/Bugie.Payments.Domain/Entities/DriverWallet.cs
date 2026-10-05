namespace Bugie.Payments.Domain.Entities;

/// <summary>
/// Billetera del conductor (tabla payments.driverwallet).
///
/// El conductor cobra TODO en mano (efectivo, Yape o Plin directo a el).
/// Bugie cobra una comision por viaje que el conductor le DEBE, asi que la
/// billetera lleva la cuenta de esa deuda:
///   Balance = comision pagada - comision generada.
///   Negativo = lo que el conductor le debe a Bugie.
///
/// Los cambios se hacen en el repositorio con una sola transaccion SQL
/// (bloqueando la fila), para que dos viajes a la vez no pisen el saldo.
/// </summary>
public class DriverWallet
{
    public Guid     Id                  { get; private set; }
    public Guid     DriverId            { get; private set; }
    public decimal  Balance             { get; private set; }
    /// <summary>Ganancia neta del conductor: monto de sus viajes menos la comision.</summary>
    public decimal  TotalEarned         { get; private set; }
    /// <summary>Columna antigua, sin uso: los pagos de Bugie estan en withdrawals.</summary>
    public decimal  TotalWithdrawn      { get; private set; }
    /// <summary>Comision que generaron sus viajes.</summary>
    public decimal  TotalCommission     { get; private set; }
    /// <summary>Comision que ya le pago a Bugie.</summary>
    public decimal  TotalCommissionPaid { get; private set; }
    public DateTime UpdatedAt           { get; private set; }

    private DriverWallet() { }

    /// <summary>Billetera vacia (para un conductor sin viajes todavia).</summary>
    public static DriverWallet Empty(Guid driverId) => new()
    {
        Id        = Guid.Empty,
        DriverId  = driverId,
        UpdatedAt = DateTime.UtcNow,
    };

    /// <summary>Lo que el conductor debe hoy (0 si no debe nada).</summary>
    public decimal PendingDebt => Balance < 0 ? -Balance : 0;
}
