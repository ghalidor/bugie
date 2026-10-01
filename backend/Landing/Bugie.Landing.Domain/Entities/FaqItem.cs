namespace Bugie.Landing.Domain.Entities;

/// <summary>
/// Pregunta frecuente que se muestra en la landing pública.
/// Agrupada por categoría (texto libre) y ordenada por SortOrder
/// dentro de cada categoría.
/// </summary>
public class FaqItem
{
    public Guid Id { get; set; }
    public string Lang { get; set; } = "es";
    public string Category { get; set; } = "";
    public string Question { get; set; } = "";
    public string Answer { get; set; } = "";
    public bool IsPublished { get; set; } = true;
    /// <summary>Orden dentro de (Lang, Category). Más bajo = primero.</summary>
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
