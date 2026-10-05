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

    // ── Documento de identidad ──────────────────────────────────────────
    /// <summary>'DNI' | 'CE' | 'PASAPORTE'. Null en cuentas antiguas que aún no lo completan.</summary>
    public string? DocType { get; private set; }
    /// <summary>Número normalizado (mayúsculas, sin espacios).</summary>
    public string? DocNumber { get; private set; }

    // ── Nombres separados (FullName se arma con ellos) ──────────────────
    public string? FirstNames { get; private set; }
    public string? LastNamePaternal { get; private set; }
    /// <summary>Opcional: hay extranjeros con un solo apellido.</summary>
    public string? LastNameMaternal { get; private set; }

    // ── Cuenta eliminada (no se borra nada) ─────────────────────────────
    /// <summary>Momento (UTC) en que se eliminó la cuenta. Null = no eliminada.</summary>
    public DateTime? DeletedAt { get; private set; }
    public string? DeletedReason { get; private set; }

    public bool IsDeleted => DeletedAt.HasValue;

    // ── Sesiones ────────────────────────────────────────────────────────
    /// <summary>
    /// Sello de seguridad. El JWT lleva el claim "sst" con este valor; al
    /// cambiarlo se cierran todas las sesiones del usuario (ver SessionState).
    /// </summary>
    public Guid SecurityStamp { get; private set; }
    /// <summary>Momento (UTC) del último cambio del sello. Null = nunca se cambió.</summary>
    public DateTime? SecurityStampChangedAt { get; private set; }

    // ── Cuenta desactivada por el admin ─────────────────────────────────
    // Distinto de IsActive (que también es false en cuentas aún no verificadas):
    // una cuenta desactivada no puede iniciar sesión ni usar su token.
    public DateTime? DeactivatedAt { get; private set; }
    public string? DeactivatedReason { get; private set; }

    public bool IsDeactivated => DeactivatedAt.HasValue;

    /// <summary>True si le falta el documento o los nombres separados.</summary>
    public bool NeedsProfileCompletion =>
        string.IsNullOrWhiteSpace(DocType) || string.IsNullOrWhiteSpace(DocNumber)
        || string.IsNullOrWhiteSpace(FirstNames) || string.IsNullOrWhiteSpace(LastNamePaternal);

    private User() { }  // Dapper necesita constructor sin parámetros

    /// <summary>"Nombres Paterno Materno" (trim y espacios simples).</summary>
    public static string ComposeFullName(string? firstNames, string? lastNamePaternal, string? lastNameMaternal) =>
        string.Join(' ', new[] { firstNames, lastNamePaternal, lastNameMaternal }
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .SelectMany(p => p!.Split(' ', StringSplitOptions.RemoveEmptyEntries)));

    public static User Create(string email, string passwordHash, string role,
        string firstNames, string lastNamePaternal, string? lastNameMaternal,
        string phone, string docType, string docNumber,
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
            FirstNames = firstNames,
            LastNamePaternal = lastNamePaternal,
            LastNameMaternal = string.IsNullOrWhiteSpace(lastNameMaternal) ? null : lastNameMaternal,
            FullName = ComposeFullName(firstNames, lastNamePaternal, lastNameMaternal),
            DocType = docType,
            DocNumber = docNumber,
            Phone = phone,
            IsActive = isAdmin,    // admin sí, otros no
            IsVerified = isAdmin,    // admin sí, otros no
            CreatedAt = DateTime.UtcNow,
            TermsAccepted = termsAccepted,
            TermsAcceptedAt = termsAccepted ? DateTime.UtcNow : null,
            SignatureImage = signatureImage,
            SecurityStamp = Guid.NewGuid(),
        };
    }

    public void Activate()
    {
        IsActive = true;
        IsVerified = true;
    }

    /// <summary>
    /// Desactivación por el admin: marca DeactivatedAt (bloquea login y token)
    /// y deja IsActive en false como antes.
    /// </summary>
    public void Deactivate(string? reason = null)
    {
        IsActive = false;
        DeactivatedAt = DateTime.UtcNow;
        DeactivatedReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
    }

    /// <summary>
    /// Reactivación por el admin: quita la marca. IsActive vuelve al valor que
    /// tendría sin la desactivación: admin = true; pasajero/conductor = según
    /// esté verificado (los no verificados siguen inactivos hasta verificarse).
    /// </summary>
    public void Reactivate()
    {
        DeactivatedAt = null;
        DeactivatedReason = null;
        IsActive = Role == "admin" || IsVerified;
    }

    /// <summary>Nuevo sello de seguridad: invalida todos los JWT emitidos antes.</summary>
    public void RotateSecurityStamp()
    {
        SecurityStamp = Guid.NewGuid();
        SecurityStampChangedAt = DateTime.UtcNow;
    }

    /// <summary>Setea la foto de perfil (URL ya almacenada por el storage).</summary>
    public void SetProfilePhoto(string url) => ProfilePhotoUrl = url;

    /// <summary>Asignar (o cambiar) el rol administrativo. Pasar null para quitar.</summary>
    public void SetAdminRole(Guid? adminRoleId) => AdminRoleId = adminRoleId;

    /// <summary>Documento ya validado y normalizado.</summary>
    public void SetDocument(string docType, string docNumber)
    {
        DocType = docType;
        DocNumber = docNumber;
    }

    /// <summary>Nombres ya validados; recalcula FullName.</summary>
    public void SetNames(string firstNames, string lastNamePaternal, string? lastNameMaternal)
    {
        FirstNames = firstNames;
        LastNamePaternal = lastNamePaternal;
        LastNameMaternal = string.IsNullOrWhiteSpace(lastNameMaternal) ? null : lastNameMaternal;
        FullName = ComposeFullName(FirstNames, LastNamePaternal, LastNameMaternal);
    }

    public void SetPasswordHash(string passwordHash) => PasswordHash = passwordHash;

    /// <summary>Estado "Eliminada": no se borra nada, solo queda inactiva.</summary>
    public void MarkDeleted(string? reason)
    {
        DeletedAt = DateTime.UtcNow;
        DeletedReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        IsActive = false;
    }

    /// <summary>Restaurar (admin): vuelve a estar activa.</summary>
    public void Restore()
    {
        DeletedAt = null;
        DeletedReason = null;
        IsActive = true;
    }
}