using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Queries;

public record GetMyDriverProfileQuery(Guid UserId) : IRequest<DriverDto?>;
