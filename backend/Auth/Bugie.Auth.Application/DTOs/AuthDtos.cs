namespace Bugie.Auth.Application.DTOs;

/// <param name="ReferralCode">
/// Código de invitación. Opcional y al final, para no romper a los
/// clientes que no lo envían.
/// </param>
/// <param name="FullName">Ya no se usa: FullName se arma con los nombres separados. Se acepta y se ignora.</param>
/// <param name="DocType">OBLIGATORIO: 'DNI' | 'CE' | 'PASAPORTE'.</param>
/// <param name="DocNumber">OBLIGATORIO. DNI 8 dígitos; CE 9-12 y pasaporte 6-12 letras/números.</param>
/// <param name="FirstNames">OBLIGATORIO: nombres.</param>
/// <param name="LastNamePaternal">OBLIGATORIO: apellido paterno.</param>
/// <param name="LastNameMaternal">Opcional (extranjeros con un solo apellido).</param>
public record RegisterRequest(string? FullName, string Email, string Password, string Phone, string Role,
    bool AcceptedTerms, string SignatureImage,
    string? ReferralCode = null,
    string? DocType = null, string? DocNumber = null,
    string? FirstNames = null, string? LastNamePaternal = null, string? LastNameMaternal = null);
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
    string? SignatureImage = null,
    // Documento y nombres separados (null en cuentas antiguas sin completar)
    string? DocType = null,
    string? DocNumber = null,
    string? FirstNames = null,
    string? LastNamePaternal = null,
    string? LastNameMaternal = null,
    // True si falta el documento o los nombres separados
    bool NeedsProfileCompletion = false,
    // Cuenta eliminada (null = no eliminada)
    DateTime? DeletedAt = null,
    string? DeletedReason = null,
    // Cuenta desactivada por el admin (null = no desactivada)
    DateTime? DeactivatedAt = null,
    string? DeactivatedReason = null)
{
    /// <summary>Arma el DTO completo desde la entidad.</summary>
    public static UserProfileDto From(Bugie.Auth.Domain.Entities.User u) => new(
        u.Id, u.FullName, u.Email, u.Phone, u.Role, u.IsActive, u.IsVerified,
        u.ProfilePhotoUrl, u.CreatedAt, u.AdminRoleId,
        u.TermsAccepted, u.TermsAcceptedAt, u.SignatureImage,
        u.DocType, u.DocNumber, u.FirstNames, u.LastNamePaternal, u.LastNameMaternal,
        u.NeedsProfileCompletion, u.DeletedAt, u.DeletedReason,
        u.DeactivatedAt, u.DeactivatedReason);
}
