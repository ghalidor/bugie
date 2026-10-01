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
    string? SignatureImage = null);
