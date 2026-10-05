using Bugie.Payments.Domain.Entities;

namespace Bugie.Payments.Domain.Interfaces;

/// <summary>Filtros del reporte de pagos a conductores.</summary>
public record PayoutFilter(
    Guid?     DriverId,
    DateTime? FromUtc,
    DateTime? ToUtc,
    string?   Method,
    string?   SourceType,
    string?   Search);

/// <summary>Total por metodo de pago para el reporte.</summary>
public class PayoutMethodTotal
{
    public string  Method { get; set; } = "";
    public int     Count  { get; set; }
    public decimal Amount { get; set; }
}

public interface IWithdrawalRepository
{
    Task AddAsync(Withdrawal w, CancellationToken ct = default);

    /// <summary>true si ese canje/premio ya tiene un pago registrado.</summary>
    Task<bool> ExistsBySourceAsync(string sourceType, string sourceRef, CancellationToken ct = default);

    /// <summary>Pago ya registrado para ese canje/premio (busca por cualquiera de las referencias).</summary>
    Task<Withdrawal?> GetBySourceAsync(string sourceType, IEnumerable<string> sourceRefs, CancellationToken ct = default);

    /// <summary>Siguiente codigo de comprobante de pago manual: PAG-2026-000123.</summary>
    Task<string> NextReceiptCodeAsync(int year, CancellationToken ct = default);

    Task<(List<Withdrawal> Items, int Total)> GetPagedAsync(
        PayoutFilter filter, int page, int pageSize, CancellationToken ct = default);

    Task<List<PayoutMethodTotal>> GetTotalsAsync(PayoutFilter filter, CancellationToken ct = default);
}
