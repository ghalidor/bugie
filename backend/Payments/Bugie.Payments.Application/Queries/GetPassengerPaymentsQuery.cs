using MediatR;
using Bugie.Payments.Application.DTOs;

namespace Bugie.Payments.Application.Queries;

public record GetPassengerPaymentsQuery(Guid PassengerId) : IRequest<List<PaymentDto>>;
