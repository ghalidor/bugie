using MediatR;
using Bugie.Payments.Application.DTOs;

namespace Bugie.Payments.Application.Queries;

public record GetDriverEarningsQuery(Guid DriverId) : IRequest<DriverEarningsDto>;
