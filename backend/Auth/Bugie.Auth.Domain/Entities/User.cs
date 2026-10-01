namespace Bugie.Auth.Domain.Entities;

/// <summary>
/// Entidad raíz de usuario. Sin dependencias externas.
/// </summary>
public class User
{
    public Guid Id { get; private set; }
    public string Email { get; private set; }
    public string PasswordHash { get; private set; }
    public string Role { get; private set; }   // "passenger" | "driver" | "admin"
    public string FullName { get; private set; }
    public string Phone { get; private set; }
    public bool IsActive { get; private set; }   // si puede usar la app
    public bool IsVerified { get; private set; }   // si pasó verificación de documentos
    /// <summary>URL pública de la foto de perfil. Null si no la ha subido.</summary>
    public string? ProfilePhotoUrl { get; private set; }
    /// <summary>
    /// Rol administrativo asignado a este usuario (NULL salvo que Role='admin').
    /// Si es admin y este campo es NULL, no tiene permisos de admin todavía.
    /// </summary>
    public Guid? AdminRoleId { get; private set; }
    public DateTime CreatedAt { get; private set; }

    /// <summary>Si el usuario aceptó los términos y condiciones al registrarse.</summary>
    public bool TermsAccepted { get; private set; }
    /// <summary>Momento (UTC) en que aceptó los términos. Null si no aceptó.</summary>
    public DateTime? TermsAcceptedAt { get; private set; }
    /// <summary>Firma digital del usuario (imagen PNG en base64 / data URL). Null si no firmó.</summary>
    public string? SignatureImage { get; private set; }

    private User() { }  // Dapper necesita constructor sin parámetros

    public static User Create(string email, string passwordHash, string role, string fullName, string phone,
        bool termsAccepted = false, string? signatureImage = null)
    {
        // Los pasajeros se crean inactivos hasta que el admin los verifique.
        // Los conductores también (ya tienen su propio flujo).
        // Solo admin nace activo.
        var isAdmin = role == "admin";

        return new User
        {
            Id = Guid.NewGuid(),
            Email = email.ToLowerInvariant().Trim(),
            PasswordHash = passwordHash,
            Role = role,
            FullName = fullName,
            Phone = phone,
            IsActive = isAdmin,    // admin sí, otros no
            IsVerified = isAdmin,    // admin sí, otros no
            CreatedAt = DateTime.UtcNow,
            TermsAccepted = termsAccepted,
            TermsAcceptedAt = termsAccepted ? DateTime.UtcNow : null,
            SignatureImage = signatureImage,
        };
    }

    public void Activate()
    {
        IsActive = true;
        IsVerified = true;
    }

    public void Deactivate() => IsActive = false;

    /// <summary>Setea la foto de perfil (URL ya almacenada por el storage).</summary>
    public void SetProfilePhoto(string url) => ProfilePhotoUrl = url;

    /// <summary>Asignar (o cambiar) el rol administrativo. Pasar null para quitar.</summary>
    public void SetAdminRole(Guid? adminRoleId) => AdminRoleId = adminRoleId;
}