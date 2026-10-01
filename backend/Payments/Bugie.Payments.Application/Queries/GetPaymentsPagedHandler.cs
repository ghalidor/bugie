using MediatR;
using Bugie.Payments.Application.Commands;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Queries;

public record GetPaymentsPagedQuery(
    int Page,
    int PageSize,
    string? Status) : IRequest<PaymentsPagedDto>;

public record PaymentsPagedDto(
    List<PaymentDto> Items,
    int Page,
    int PageSize,
    int Total);

public class GetPaymentsPagedHandler
    : IRequestHandler<GetPaymentsPagedQuery, PaymentsPagedDto> {
    private readonly IPaymentRepository _payments;
    public GetPaymentsPagedHandler(IPaymentRepository payments) => _payments = payments;

    public async Task<PaymentsPagedDto> Handle(GetPaymentsPagedQuery q, CancellationToken ct) {
        var (list, total) = await _payments.GetPagedAsync(q.Page, q.PageSize, q.Status, ct);
        var items = list.Select(CreatePaymentHandler.ToDto).ToList();
        return new PaymentsPagedDto(items, q.Page, q.PageSize, total);
    }
}
