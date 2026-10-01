using MediatR;
using Bugie.Payments.Application.DTOs;

namespace Bugie.Payments.Application.Commands;

public record CompletePaymentCommand(Guid PaymentId, string? Reference) : IRequest<PaymentDto>;
