using MediatR;
using Bugie.Auth.Application.DTOs;

namespace Bugie.Auth.Application.Commands;

public record LoginCommand(string Email, string Password) : IRequest<AuthResponse>;
