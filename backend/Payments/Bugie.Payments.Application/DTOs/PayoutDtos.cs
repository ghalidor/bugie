namespace Bugie.Payments.Application.DTOs;

/// <summary>Pago registrado a un conductor.</summary>
/// <param name="Code">Codigo del pago: canje (BG-...), premio (PZ-...) o comprobante manual (PAG-...).</param>
public record PayoutDto(
    Guid      Id,
    Guid      DriverId,
    string?   DriverName,
    decimal   Amount,
    string    Method,
    string?   AccountRef,
    string?   OperationNumber,
    DateTime? PaidAt,
    string?   PaidByAdminName,
    string?   Note,
    string    SourceType,
    string?   SourceRef,
    DateTime  CreatedAt,
    string?   Code);

public record PayoutTotalDto(string Method, int Count, decimal Amount);

/// <summary>Pagina del reporte + totales del filtro completo (no solo de la pagina).</summary>
public record PayoutReportDto(
    List<PayoutDto>      Items,
    int                  Total,
    int                  Page,
    int                  PageSize,
    decimal              TotalAmount,
    List<PayoutTotalDto> ByMethod);

public record RegisterPayoutRequest(
    Guid      DriverId,
    string?   DriverName,
    decimal   Amount,
    string    Method,
    string?   AccountRef,
    string?   OperationNumber,
    DateTime? PaidAt,
    string?   Note,
    string?   SourceType,
    string?   SourceRef);

/// <summary>Lo que hay detras de un codigo de cobro (canje BG-... o premio PZ-...).</summary>
/// <param name="ExistingPayout">Pago ya registrado con este codigo (si existe).</param>
public record PayoutCodeLookupDto(
    string     Kind,
    string     Code,
    Guid       DriverId,
    string?    DriverName,
    string?    UserRole,
    string     Title,
    string?    Detail,
    decimal?   Amount,
    string     Status,
    string     StatusLabel,
    bool       Payable,
    string?    Reason,
    DateTime?  ExpiresAt,
    DateTime?  SettledAt,
    DateTime   CreatedAt,
    PayoutDto? ExistingPayout);

/// <summary>Pago de un codigo. Amount solo se usa si el premio no tiene monto.</summary>
public record PayByCodeRequest(
    string    Method,
    string?   OperationNumber,
    DateTime? PaidAt,
    string?   Note,
    decimal?  Amount);
