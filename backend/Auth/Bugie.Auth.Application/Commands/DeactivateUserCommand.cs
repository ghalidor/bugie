using MediatR;

namespace Bugie.Auth.Application.Commands;

public record DeactivateUserCommand(Guid UserId) : IRequest<bool>;
