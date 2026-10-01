using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

public record AddReviewCommand(
    Guid DriverId, Guid PassengerId,
    Guid TripId, byte Rating, string? Comment) : IRequest<Unit>;
