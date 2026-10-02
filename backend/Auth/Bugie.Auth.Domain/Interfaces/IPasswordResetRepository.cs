namespace Bugie.Auth.Domain.Interfaces;

/// <summary>
/// Enlaces de recuperacion de contrasena (auth.PasswordResetTokens).
/// Solo se guarda el hash del token, nunca el token en claro.
/// </summary>
public interface IPasswordResetRepository
{
    /// <summary>Anula los enlaces sin usar del usuario (al pedir uno nuevo).</summary>
    Task InvalidatePendingAsync(Guid userId, CancellationToken ct = default);

    Task AddAsync(Guid userId, string tokenHash, DateTime expiresAtUtc, CancellationToken ct = default);

    /// <summary>true si el token existe, no se uso y no vencio.</summary>
    Task<bool> IsValidAsync(string tokenHash, CancellationToken ct = default);

    /// <summary>
    /// Marca el token como usado si sigue vigente y devuelve el usuario.
    /// Es atomico: dos intentos con el mismo enlace no pueden usarlo ambos.
    /// Devuelve null si no existe, ya se uso o vencio.
    /// </summary>
    Task<Guid?> ConsumeAsync(string tokenHash, CancellationToken ct = default);

    Task UpdatePasswordHashAsync(Guid userId, string passwordHash, CancellationToken ct = default);
}
