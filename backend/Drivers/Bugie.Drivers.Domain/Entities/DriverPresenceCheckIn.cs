namespace Bugie.Drivers.Domain.Entities;

/// <summary>
/// Registro de una sesión "en línea" del conductor.
/// Se crea cuando el conductor pasa la verificación facial y se pone online.
/// Se "cierra" (CheckedOutAt) cuando se desconecta.
/// </summary>
public class DriverPresenceCheckIn
{
    public Guid Id { get; set; }
    public Guid DriverUserId { get; set; }
    public string PhotoUrl { get; set; } = "";
    public DateTime CheckedInAt { get; set; }
    public DateTime? CheckedOutAt { get; set; }
    /// <summary>Score 0-1 del ML Kit al capturar (calidad de la foto).</summary>
    public decimal? FaceQualityScore { get; set; }
    public DateTime CreatedAt { get; set; }
}
