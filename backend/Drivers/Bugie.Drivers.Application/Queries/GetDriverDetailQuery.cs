using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Queries;

public record GetDriverDetailQuery(Guid DriverId) : IRequest<DriverDetailDto?>;
