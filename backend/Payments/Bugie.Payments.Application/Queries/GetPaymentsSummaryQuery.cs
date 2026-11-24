using MediatR;
using Bugie.Payments.Domain.Common;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Queries;

/// <summary>Resumen de gestion de pagos y comisiones del periodo (panel admin).</summary>
public record GetPaymentsSummaryQuery(ReportPeriod Period) : IRequest<PaymentsSummaryDto>;

/// <summary>Fechas como texto "YYYY-MM-DD" para que no pasen por el conversor de hora.</summary>
public record PaymentsSummaryDto(
    string From,
    string To,
    PaymentsTotalsRow Totals,
    IReadOnlyList<PaymentsByMethodRow> ByMethod,
    IReadOnlyList<PaymentsDailyRow> Daily,
    CommissionsSummaryRow Commissions);

public class GetPaymentsSummaryHandler : IRequestHandler<GetPaymentsSummaryQuery, PaymentsSummaryDto>
{
    // Metodos que siempre se muestran (con 0 si no hubo pagos).
    private static readonly string[] Methods = { "cash", "yape", "plin" };

    private readonly IAdminReportsRepository _reports;
    public GetPaymentsSummaryHandler(IAdminReportsRepository reports) => _reports = reports;

    public async Task<PaymentsSummaryDto> Handle(GetPaymentsSummaryQuery q, CancellationToken ct)
    {
        var data = await _reports.GetPaymentsSummaryAsync(q.Period, ct);

        // cash, yape y plin primero (rellenados con 0); luego cualquier otro metodo que exista.
        var byMethod = Methods
            .Select(m => data.ByMethod.FirstOrDefault(r => r.Method == m) ?? new PaymentsByMethodRow { Method = m })
            .Concat(data.ByMethod.Where(r => !Methods.Contains(r.Method)))
            .ToList();

        return new PaymentsSummaryDto(
            q.Period.FromText, q.Period.ToText,
            data.Totals, byMethod, data.Daily, data.Commissions);
    }
}
