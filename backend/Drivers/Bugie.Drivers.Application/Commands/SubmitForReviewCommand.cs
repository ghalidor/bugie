using MediatR;
using Bugie.Drivers.Application.DTOs;

namespace Bugie.Drivers.Application.Commands;

public record SubmitForReviewCommand(Guid UserId) : IRequest<DriverDto>;
