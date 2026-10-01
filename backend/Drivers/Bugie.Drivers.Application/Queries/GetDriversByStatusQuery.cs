using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Domain.Enums;
using MediatR;

public record GetDriversByStatusQuery(DriverStatus Status) : IRequest<List<DriverDto>>;
