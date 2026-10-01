using MediatR;
using Bugie.Payments.Application.Commands;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Queries;

public class GetPassengerPaymentsHandler : IRequestHandler<GetPassengerPaymentsQuery, List<PaymentDto>>
{
    private readonly IPaymentRepository _payments;
    public GetPassengerPaymentsHandler(IPaymentRepository payments) => _payments = payments;

    public async Task<List<PaymentDto>> Handle(GetPassengerPaymentsQuery q, CancellationToken ct)
    {
        var list = await _payments.GetByPassengerAsync(q.PassengerId, ct);
        return list.Select(CreatePaymentHandler.ToDto).ToList();
    }
}
