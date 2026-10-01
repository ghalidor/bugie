using MediatR;

namespace Bugie.Auth.Application.Commands;

public record ResetPasswordCommand(string Token, string NewPassword) : IRequest<bool>;
