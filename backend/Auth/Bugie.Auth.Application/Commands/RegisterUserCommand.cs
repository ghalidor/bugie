using MediatR;
using Bugie.Auth.Application.DTOs;

namespace Bugie.Auth.Application.Commands;

public record RegisterUserCommand(string? FullName, string Email, string Password, string Phone, string Role,
    bool AcceptedTerms, string SignatureImage, string? ReferralCode = null,
    string? DocType = null, string? DocNumber = null,
    string? FirstNames = null, string? LastNamePaternal = null, string? LastNameMaternal = null)
    : IRequest<AuthResponse>;
