using MediatR;
using Bugie.Payments.Application.Commands;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Common;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Queries;

public record GetPaymentsPagedQuery(
    int Page,
    int PageSize,
    string? Status,
    // Busqueda (nombre/correo/documento de pasajero o conductor, referencia o Id del viaje),
    // metodo (cash/yape/plin) y rango de fechas (dias de Peru, ambos incluidos).
    string? Search = null,
    string? Method = null,
    DateTime? From = null,
    DateTime? To = null) : IRequest<PaymentsPagedDto>;

public record PaymentsPagedDto(
    List<PaymentDto> Items,
    int Page,
    int PageSize,
    int Total);

public class GetPaymentsPagedHandler
    : IRequestHandler<GetPaymentsPagedQuery, PaymentsPagedDto> {
    private readonly IPaymentRepository _payments;
    private readonly IUserNames         _names;
    public GetPaymentsPagedHandler(IPaymentRepository payments, IUserNames names)
        => (_payments, _names) = (payments, names);

    public async Task<PaymentsPagedDto> Handle(GetPaymentsPagedQuery q, CancellationToken ct) {
        var (list, total) = await _payments.GetPagedAsync(q.Page, q.PageSize, q.Status, ct,
            q.Search, q.Method,
            q.From is null ? null : BugieTime.PeruToUtc(q.From.Value.Date),
            q.To   is null ? null : BugieTime.PeruToUtc(q.To.Value.Date.AddDays(1)));
        // Nombres de quien pago y quien cobro, para el admin.
        var names = await _names.GetByIdsAsync(list.SelectMany(p => new[] { p.PassengerId, p.DriverId }), ct);
        var items = list.Select(p => CreatePaymentHandler.ToDto(p) with
        {
            PassengerName = names.GetValueOrDefault(p.PassengerId),
            DriverName    = names.GetValueOrDefault(p.DriverId),
        }).ToList();
        return new PaymentsPagedDto(items, q.Page, q.PageSize, total);
    }
}
