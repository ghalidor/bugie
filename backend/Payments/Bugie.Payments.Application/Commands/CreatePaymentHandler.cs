using MediatR;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Domain.Entities;
using Bugie.Payments.Domain.Interfaces;

namespace Bugie.Payments.Application.Commands;

public class CreatePaymentHandler : IRequestHandler<CreatePaymentCommand, PaymentDto>
{
    /// <summary>Metodos con los que el pasajero le paga al conductor (en mano).</summary>
    public static readonly HashSet<string> Methods = ["cash", "yape", "plin"];

    /// <summary>TripStatus.Completed de Trips.</summary>
    private const short TripCompleted = 4;

    private readonly IPaymentRepository     _payments;
    private readonly IPlatformFeeRepository _fees;
    private readonly IWalletRepository      _wallets;
    private readonly ITripLookup            _trips;

    public CreatePaymentHandler(
        IPaymentRepository payments, IPlatformFeeRepository fees,
        IWalletRepository wallets, ITripLookup trips)
    {
        _payments = payments;
        _fees     = fees;
        _wallets  = wallets;
        _trips    = trips;
    }

    public async Task<PaymentDto> Handle(CreatePaymentCommand cmd, CancellationToken ct)
    {
        // -- Validaciones --
        // El monto puede ser 0 (viaje gratis por cupon), nunca negativo.
        var method = (cmd.Method ?? "").Trim().ToLowerInvariant();
        if (cmd.Amount < 0 || cmd.Amount > 100000)
            throw new InvalidOperationException("El monto no es valido.");
        if (!Methods.Contains(method))
            throw new InvalidOperationException("Metodo de pago no valido. Usa cash, yape o plin.");

        // El pago tiene que corresponder al viaje: mismo conductor y pasajero,
        // viaje completado y el monto final que guardo Trips. Asi nadie puede
        // inventar pagos (ni comisiones) para viajes ajenos.
        var trip = await _trips.GetAsync(cmd.TripId, ct)
            ?? throw new InvalidOperationException("El viaje no existe.");
        if (trip.DriverId != cmd.DriverId || trip.PassengerId != cmd.PassengerId)
            throw new UnauthorizedAccessException("El pago no corresponde al conductor o pasajero del viaje.");
        if (trip.Status != TripCompleted)
            throw new InvalidOperationException("Solo se registra el pago de un viaje completado.");
        if (trip.FinalFare is not null && trip.FinalFare.Value != cmd.Amount)
            throw new InvalidOperationException("El monto no coincide con la tarifa final del viaje.");

        // Idempotente por viaje: si Trips repite el POST, se devuelve el pago
        // que ya existe (y se asegura su comision en la billetera).
        var existing = await _payments.GetByTripIdAsync(cmd.TripId, ct);
        if (existing is not null)
        {
            await RegisterCommissionAsync(existing, ct);
            return ToDto(existing);
        }

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
            cmd.TripId, cmd.PassengerId, cmd.DriverId, cmd.Amount, method,
            platformFeePercent: porcentaje);

        // Completar inmediatamente — efectivo, yape y plin son pagos al momento
        payment.Complete(reference: null);

        await _payments.AddAsync(payment, ct);

        // El conductor cobro todo en mano: ahora le debe la comision a Bugie.
        await RegisterCommissionAsync(payment, ct);
        return ToDto(payment);
    }

    /// <summary>
    /// Anota en la billetera la comision del viaje (baja el saldo = deuda) y
    /// suma la ganancia neta. El repositorio no la duplica si ya estaba.
    /// Un viaje gratis (monto 0) no genera nada.
    /// </summary>
    private async Task RegisterCommissionAsync(Payment p, CancellationToken ct)
    {
        if (p.Status != "completed" || p.Amount <= 0) return;
        await _wallets.AddCommissionAsync(
            WalletTransaction.Commission(p.DriverId, p.TripId, p.Amount, p.PlatformFee), ct);
    }

    internal static PaymentDto ToDto(Payment p) => new(
        p.Id, p.TripId, p.PassengerId, p.DriverId,
        p.Amount, p.Method, p.Status, p.Reference, p.CreatedAt, p.PaidAt,
        p.PlatformFee, p.DriverAmount, p.PlatformFeeRate);
}