namespace Bugie.Drivers.Domain.Entities;

/// <summary>
/// Una foto del vehiculo (tabla drivers.vehiclephotos).
/// Cada vehiculo tiene como maximo una foto por tipo: front, side, plate.
/// </summary>
public class VehiclePhoto
{
    public const string Front = "front";
    public const string Side  = "side";
    public const string Plate = "plate";

    /// <summary>Tipos validos, en el orden en que se muestran.</summary>
    public static readonly string[] Types = { Front, Side, Plate };

    public static bool IsValidType(string? type) => type is not null && Types.Contains(type);

    public Guid Id { get; set; }
    public Guid VehicleId { get; set; }
    public string PhotoType { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
