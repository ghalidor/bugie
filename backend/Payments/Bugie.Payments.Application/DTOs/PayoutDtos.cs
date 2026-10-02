namespace Bugie.Payments.Application.DTOs;

/// <summary>Pago registrado a un conductor.</summary>
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
    DateTime  CreatedAt);

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
