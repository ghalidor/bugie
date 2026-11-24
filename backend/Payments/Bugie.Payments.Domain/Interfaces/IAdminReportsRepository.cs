using Bugie.Payments.Domain.Common;

namespace Bugie.Payments.Domain.Interfaces;

/// <summary>Reportes administrativos de pagos y comisiones (solo lectura).</summary>
public interface IAdminReportsRepository
{
    /// <summary>
    /// Resumen de pagos completados del periodo (dia por COALESCE(PaidAt, CreatedAt)),
    /// por metodo, serie diaria (todos los dias) y comisiones de la billetera.
    /// </summary>
    Task<PaymentsSummaryData> GetPaymentsSummaryAsync(ReportPeriod period, CancellationToken ct = default);
}

/// <summary>Datos crudos del resumen (ver GetPaymentsSummaryAsync).</summary>
public sealed class PaymentsSummaryData
{
    public PaymentsTotalsRow Totals { get; set; } = new();
    public List<PaymentsByMethodRow> ByMethod { get; set; } = new();
    public List<PaymentsDailyRow> Daily { get; set; } = new();
    public CommissionsSummaryRow Commissions { get; set; } = new();
}

public sealed class PaymentsTotalsRow
{
    public int Payments { get; set; }
    public decimal Amount { get; set; }
    public decimal PlatformFee { get; set; }
    public decimal DriverAmount { get; set; }
    public decimal? AvgFeeRatePct { get; set; }
}

public sealed class PaymentsByMethodRow
{
    public string Method { get; set; } = "";
    public int Count { get; set; }
    public decimal Amount { get; set; }
    public decimal PlatformFee { get; set; }
}

/// <summary>Un dia de Peru (YYYY-MM-DD) del periodo.</summary>
public sealed class PaymentsDailyRow
{
    public string Date { get; set; } = "";
    public decimal Amount { get; set; }
    public decimal PlatformFee { get; set; }
}

/// <summary>
/// Charged: comisiones generadas en el periodo (WalletTransactions 'comision').
/// Paid: pagos de comision recibidos en el periodo ('pago_comision').
/// PendingNow: deuda total actual (suma de saldos negativos de DriverWallet).
/// </summary>
public sealed class CommissionsSummaryRow
{
    public decimal Charged { get; set; }
    public decimal Paid { get; set; }
    public decimal PendingNow { get; set; }
}
