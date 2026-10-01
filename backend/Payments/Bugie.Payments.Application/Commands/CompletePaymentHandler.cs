using MediatR;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Commands;

public class CompletePaymentHandler : IRequestHandler<CompletePaymentCommand, PaymentDto>
{
    private readonly IPaymentRepository _payments;
    public CompletePaymentHandler(IPaymentRepository payments) => _payments = payments;

    public async Task<PaymentDto> Handle(CompletePaymentCommand cmd, CancellationToken ct)
    {
        var p = await _payments.GetByIdAsync(cmd.PaymentId, ct)
            ?? throw new KeyNotFoundException("Pago no encontrado.");
        p.Complete(cmd.Reference);
        await _payments.UpdateAsync(p, ct);
        return CreatePaymentHandler.ToDto(p);
    }
}
