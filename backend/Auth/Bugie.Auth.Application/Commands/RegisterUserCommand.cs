using MediatR;
using Bugie.Auth.Application.DTOs;

namespace Bugie.Auth.Application.Commands;

public record RegisterUserCommand(string FullName, string Email, string Password, string Phone, string Role,
    bool AcceptedTerms, string SignatureImage)
    : IRequest<AuthResponse>;
