namespace Bugie.Auth.Application.DTOs;

public record RegisterRequest(string FullName, string Email, string Password, string Phone, string Role,
    bool AcceptedTerms, string SignatureImage);
public record LoginRequest(string Email, string Password);
public record AuthResponse(string Token, string Role, string FullName, Guid UserId);

/// <summary>
/// Datos del usuario logueado. Se expone en GET /api/auth/me.
/// </summary>
public record UserProfileDto(
    Guid Id,
    string FullName,
    string Email,
    string Phone,
    string Role,
    bool IsActive,
    bool IsVerified,
    string? ProfilePhotoUrl,
    DateTime CreatedAt,
    Guid? AdminRoleId,
    bool TermsAccepted = false,
    DateTime? TermsAcceptedAt = null,
    string? SignatureImage = null);
