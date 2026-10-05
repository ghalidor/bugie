using Bugie.Payments.Domain.Entities;

namespace Bugie.Payments.Domain.Interfaces;

/// <summary>Billetera + nombre del conductor (listado del admin).</summary>
public class WalletWithName
{
    public Guid     DriverId            { get; set; }
    public string?  DriverName          { get; set; }
    public decimal  Balance             { get; set; }
    public decimal  TotalEarned         { get; set; }
    public decimal  TotalCommission     { get; set; }
    public decimal  TotalCommissionPaid { get; set; }
    public DateTime UpdatedAt           { get; set; }
}

/// <summary>Pago de comision + nombre del conductor (listado del admin).</summary>
public class CommissionPaymentRow
{
    public long      Id              { get; set; }
    public Guid      DriverId        { get; set; }
    public string?   DriverName      { get; set; }
    public decimal   Amount          { get; set; }
    public decimal   BalanceAfter    { get; set; }
    public string?   Method          { get; set; }
    public string?   OperationNumber { get; set; }
    public string?   Note            { get; set; }
    public DateTime? PaidAt          { get; set; }
    public string?   AdminName       { get; set; }
    public DateTime  CreatedAt       { get; set; }
}

public interface IWalletRepository
{
    Task<DriverWallet?> GetByDriverAsync(Guid driverId, CancellationToken ct = default);

    /// <summary>
    /// Registra la comision de un viaje (baja el saldo y suma la ganancia neta).
    /// Idempotente por viaje: si ese viaje ya tenia su comision, no hace nada
    /// y devuelve false.
    /// </summary>
    Task<bool> AddCommissionAsync(WalletTransaction tx, CancellationToken ct = default);

    /// <summary>Registra un pago de comision (sube el saldo). Llena BalanceAfter e Id.</summary>
    Task AddCommissionPaymentAsync(WalletTransaction tx, CancellationToken ct = default);

    /// <summary>Movimientos del conductor, del mas nuevo al mas antiguo.</summary>
    Task<(List<WalletTransaction> Items, int Total)> GetTransactionsAsync(
        Guid driverId, int page, int pageSize, CancellationToken ct = default);

    /// <summary>
    /// Billeteras para el admin, de la mayor deuda a la menor.
    /// onlyDebt = solo las que deben algo. Devuelve tambien la deuda total
    /// y cuantos conductores deben (de todo el filtro, no solo la pagina).
    /// </summary>
    Task<(List<WalletWithName> Items, int Total, decimal TotalDebt, int DriversWithDebt)> GetWalletsAsync(
        string? search, bool onlyDebt, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Pagos de comision registrados (todos o de un conductor) con su total.</summary>
    Task<(List<CommissionPaymentRow> Items, int Total, decimal TotalAmount)> GetCommissionPaymentsAsync(
        Guid? driverId, int page, int pageSize, CancellationToken ct = default);
}
