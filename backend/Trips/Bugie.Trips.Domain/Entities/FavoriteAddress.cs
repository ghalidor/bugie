namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Dirección guardada por un pasajero para usar como atajo al solicitar viaje.
/// </summary>
public class FavoriteAddress {
    public Guid Id { get; set; }
    public Guid PassengerId { get; set; }
    public string Label { get; set; } = "";
    /// <summary>
    /// Nombre del icono (ej. "home", "briefcase", "graduation-cap").
    /// El frontend lo mapea a Material Icons / FontAwesome.
    /// </summary>
    public string Icon { get; set; } = "location_on";
    public string Address { get; set; } = "";
    public string? Description { get; set; }
    public decimal Lat { get; set; }
    public decimal Lng { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
}
