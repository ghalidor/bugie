using MediatR;
using Bugie.Payments.Application.DTOs;

namespace Bugie.Payments.Application.Commands;

public record CreatePaymentCommand(
    Guid TripId, Guid PassengerId, Guid DriverId,
    decimal Amount, string Method) : IRequest<PaymentDto>;
