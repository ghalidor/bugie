using MediatR;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Commands;

public class CreatePaymentHandler : IRequestHandler<CreatePaymentCommand, PaymentDto>
{
    private readonly IPaymentRepository _payments;
    public CreatePaymentHandler(IPaymentRepository payments) => _payments = payments;

    public async Task<PaymentDto> Handle(CreatePaymentCommand cmd, CancellationToken ct)
    {
        var payment = Payment.Create(
            cmd.TripId, cmd.PassengerId, cmd.DriverId, cmd.Amount, cmd.Method);

        // Completar inmediatamente — efectivo, yape y plin son pagos al momento
        payment.Complete(reference: null);

        await _payments.AddAsync(payment, ct);
        return ToDto(payment);
    }

    internal static PaymentDto ToDto(Payment p) => new(
        p.Id, p.TripId, p.PassengerId, p.DriverId,
        p.Amount, p.Method, p.Status, p.Reference, p.CreatedAt, p.PaidAt);
}