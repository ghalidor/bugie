namespace Bugie.Auth.Domain.Entities;

/// <summary>
/// Token FCM (Firebase Cloud Messaging) asociado a un dispositivo donde el
/// usuario tiene la app instalada. Sirve para mandarle notificaciones push
/// (solicitudes entrantes, SOS, etc).
///
/// Reglas:
///   - Un usuario puede tener varios tokens (varios dispositivos).
///   - Un mismo token solo puede pertenecer a un usuario.
///   - Si un dispositivo cambia su token (rotación FCM), se actualiza el
///     existente (no se crea uno nuevo).
/// </summary>
public class UserFcmToken
{
    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public string Token { get; private set; } = string.Empty;
    public string Platform { get; private set; } = "android"; // 'android' | 'ios'
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    private UserFcmToken() { }  // Dapper

    public static UserFcmToken Create(Guid userId, string token, string platform)
    {
        return new UserFcmToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Token = token,
            Platform = platform,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
    }

    /// <summary>
    /// Cuando el mismo dispositivo manda otra vez su token (rotó), actualizamos
    /// el dueño (puede haber cambiado de cuenta) y la fecha.
    /// </summary>
    public void UpdateOwner(Guid userId, string platform)
    {
        UserId = userId;
        Platform = platform;
        UpdatedAt = DateTime.UtcNow;
    }
}
