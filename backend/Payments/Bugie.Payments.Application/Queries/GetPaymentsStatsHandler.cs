using MediatR;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Queries;

/// <summary>
/// KPIs de pagos. Una sola query SQL con SUM(CASE WHEN..).
/// Los totales monetarios siempre se calculan sobre pagos COMPLETED.
/// "Pendientes" cuenta filas con status='pending'.
/// </summary>
public record GetPaymentsStatsQuery(string? Status) : IRequest<PaymentsStatsDto>;

public record PaymentsStatsDto(
    decimal TotalAmount,
    decimal TotalFee,
    decimal TotalDriver,
    int PendingCount,
    int CompletedCount);

public class GetPaymentsStatsHandler
    : IRequestHandler<GetPaymentsStatsQuery, PaymentsStatsDto> {
    private readonly IPaymentRepository _payments;
    public GetPaymentsStatsHandler(IPaymentRepository payments) => _payments = payments;

    public async Task<PaymentsStatsDto> Handle(GetPaymentsStatsQuery q, CancellationToken ct) {
        var (totalAmount, totalFee, totalDriver, pendingCount, completedCount) =
            await _payments.GetStatsAsync(q.Status, ct);
        return new PaymentsStatsDto(totalAmount, totalFee, totalDriver, pendingCount, completedCount);
    }
}
