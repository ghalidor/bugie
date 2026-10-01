using MediatR;

namespace Bugie.Auth.Application.Commands;

public record ForgotPasswordCommand(string Email) : IRequest<string>;
