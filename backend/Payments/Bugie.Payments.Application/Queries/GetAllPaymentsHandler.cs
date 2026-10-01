using MediatR;
using Bugie.Payments.Application.Commands;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Queries;

public class GetAllPaymentsHandler : IRequestHandler<GetAllPaymentsQuery, List<PaymentDto>>
{
    private readonly IPaymentRepository _payments;
    public GetAllPaymentsHandler(IPaymentRepository payments) => _payments = payments;

    public async Task<List<PaymentDto>> Handle(GetAllPaymentsQuery q, CancellationToken ct)
    {
        var list = await _payments.GetAllAsync(q.Status, ct);
        return list.Select(CreatePaymentHandler.ToDto).ToList();
    }
}
