namespace Bugie.Drivers.Domain.External;

/// <summary>
/// DTO espejo del UserProfileDto de Auth.Api.
/// Solo contiene los campos que Drivers necesita consumir vía HTTP.
/// Vive en Domain para respetar Onion: las capas internas definen los
/// contratos, las externas los implementan.
/// </summary>
public record UserInfoDto(
    Guid Id,
    string FullName,
    string Email,
    string Phone,
    string Role,
    bool IsActive,
    DateTime CreatedAt,
    bool TermsAccepted = false,
    string? SignatureImage = null,
    // Documento y nombres separados (el documento solo llega si consulta un admin)
    string? DocType = null,
    string? DocNumber = null,
    string? FirstNames = null,
    string? LastNamePaternal = null,
    string? LastNameMaternal = null,
    // Cuenta eliminada (null = no eliminada)
    DateTime? DeletedAt = null,
    string? DeletedReason = null,
    // Cuenta desactivada por el admin (null = no desactivada)
    DateTime? DeactivatedAt = null,
    string? DeactivatedReason = null);
