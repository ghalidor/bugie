using MediatR;
using Bugie.Payments.Application.DTOs;

namespace Bugie.Payments.Application.Queries;

/// <summary>Solo admin — todos los pagos con filtro opcional por status.</summary>
public record GetAllPaymentsQuery(string? Status = null) : IRequest<List<PaymentDto>>;
