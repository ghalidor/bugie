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

    // ── Verificación facial (interna: el conductor no la ve) ────────────
    /// <summary>"passed" si la app hizo la prueba de vida (parpadeo + giro).</summary>
    public string? Liveness { get; set; }
    /// <summary>Resultado: FaceCheck.* (NULL = conexión anterior a la verificación facial).</summary>
    public string? FaceStatus { get; set; }
    /// <summary>Similitud con la referencia (coseno). NULL si no se comparó.</summary>
    public float? FaceScore { get; set; }
    public string? FaceModel { get; set; }
    /// <summary>Foto de referencia usada en esa conexión.</summary>
    public string? FaceReferencePhotoUrl { get; set; }
    public string? FaceError { get; set; }
    /// <summary>Revisión del admin si no coincidió: FaceCheck.Review*.</summary>
    public string? FaceReviewStatus { get; set; }
    public string? FaceReviewNote { get; set; }
    public Guid? FaceReviewedBy { get; set; }
    public string? FaceReviewedByName { get; set; }
    public DateTime? FaceReviewedAt { get; set; }
}
