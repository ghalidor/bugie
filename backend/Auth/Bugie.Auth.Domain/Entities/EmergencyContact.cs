namespace Bugie.Auth.Domain.Entities;

/// <summary>
/// Contacto de emergencia de un usuario (pasajero o conductor).
///
/// Reglas:
///   - Un solo contacto por usuario (UNIQUE en auth.EmergencyContacts.UserId).
///   - El correo es opcional; si existe, se le avisa cuando el usuario
///     activa un SOS.
/// </summary>
public class EmergencyContact
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Relationship { get; set; } = string.Empty;
    public string? Email { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
