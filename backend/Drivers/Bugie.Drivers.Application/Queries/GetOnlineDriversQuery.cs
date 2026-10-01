using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Queries;

public record GetOnlineDriversQuery : IRequest<List<DriverDto>>;
