namespace Bugie.Payments.Application.DTOs;

/// <summary>
/// Resumen de la billetera del conductor.
/// PendingDebt = comision que todavia le debe a Bugie (Balance negativo).
/// </summary>
public record WalletSummaryDto(
    Guid     DriverId,
    string?  DriverName,
    decimal  TotalEarned,          // ganancia neta: monto de viajes - comision
    decimal  TotalCommission,      // comision generada
    decimal  TotalCommissionPaid,  // comision ya pagada
    decimal  PendingDebt,          // lo que debe hoy
    decimal  Balance,              // pagado - generado (negativo = deuda)
    DateTime UpdatedAt);

/// <summary>Movimiento de la billetera: 'comision' o 'pago_comision'.</summary>
public record WalletMovementDto(
    long      Id,
    string    Type,
    decimal   Amount,
    decimal   BalanceAfter,
    Guid?     TripId,
    decimal?  TripAmount,
    string?   Method,
    string?   OperationNumber,
    string?   Note,
    DateTime? PaidAt,
    string?   AdminName,
    DateTime  CreatedAt);

/// <summary>Billetera + pagina de movimientos.</summary>
public record DriverWalletDto(
    WalletSummaryDto        Summary,
    decimal                 CurrentFeePercent,
    List<WalletMovementDto> Movements,
    int                     Total,
    int                     Page,
    int                     PageSize);

/// <summary>Listado del admin: billeteras (por defecto solo las que deben).</summary>
public record WalletsReportDto(
    List<WalletSummaryDto> Items,
    int                    Total,
    int                    Page,
    int                    PageSize,
    decimal                TotalDebt,
    int                    DriversWithDebt);

/// <summary>Pago de comision recibido de un conductor.</summary>
public record CommissionPaymentDto(
    long      Id,
    Guid      DriverId,
    string?   DriverName,
    decimal   Amount,
    decimal   BalanceAfter,
    string?   Method,
    string?   OperationNumber,
    string?   Note,
    DateTime? PaidAt,
    string?   AdminName,
    DateTime  CreatedAt);

public record CommissionPaymentsReportDto(
    List<CommissionPaymentDto> Items,
    int                        Total,
    int                        Page,
    int                        PageSize,
    decimal                    TotalAmount);

public record RegisterCommissionPaymentRequest(
    Guid      DriverId,
    decimal   Amount,
    string    Method,
    string?   OperationNumber,
    DateTime? PaidAt,
    string?   Note);
