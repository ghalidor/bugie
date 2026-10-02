using MediatR;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Commands;

public class CreatePaymentHandler : IRequestHandler<CreatePaymentCommand, PaymentDto>
{
    private readonly IPaymentRepository     _payments;
    private readonly IPlatformFeeRepository _fees;

    public CreatePaymentHandler(
        IPaymentRepository payments, IPlatformFeeRepository fees)
    {
        _payments = payments;
        _fees     = fees;
    }

    public async Task<PaymentDto> Handle(CreatePaymentCommand cmd, CancellationToken ct)
    {
        // La comision sale del admin, en porcentaje (10 = 10%).
        var porcentaje = await _fees.GetFeePercentAsync(ct);

        // cmd.Amount es lo que SE PAGO, ya con el descuento del cupon si lo
        // hubo: Trips manda la tarifa final, no la original. Asi la comision
        // sale de lo que de verdad entro, y un viaje gratis no genera comision.
        //
        // El porcentaje se GUARDA con el pago. Si manana cambias la comision,
        // este viaje sigue diciendo con cual se cobro: el dato pertenece al
        // registro, no a la configuracion de hoy.
        var payment = Payment.Create(
            cmd.TripId, cmd.PassengerId, cmd.DriverId, cmd.Amount, cmd.Method,
            platformFeePercent: porcentaje);

        // Completar inmediatamente — efectivo, yape y plin son pagos al momento
        payment.Complete(reference: null);

        await _payments.AddAsync(payment, ct);
        return ToDto(payment);
    }

    internal static PaymentDto ToDto(Payment p) => new(
        p.Id, p.TripId, p.PassengerId, p.DriverId,
        p.Amount, p.Method, p.Status, p.Reference, p.CreatedAt, p.PaidAt,
        p.PlatformFee, p.DriverAmount, p.PlatformFeeRate);
}