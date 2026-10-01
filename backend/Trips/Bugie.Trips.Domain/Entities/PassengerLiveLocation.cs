namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Snapshot ligero del estado en vivo de un viaje. Lo usa el admin en monitoreo.
///
/// IMPORTANTE: usamos CLASE con props mutables (no record con primary constructor)
/// porque Dapper deserializa property-by-property y no exige un constructor que
/// matchee exacto. Con records nullable y joins cross-schema (auth.Users,
/// drivers.Drivers) tuvimos problemas de mapping del constructor.
/// </summary>
public class PassengerLiveLocation
{
    public Guid TripId { get; set; }
    public Guid PassengerId { get; set; }
    public Guid? DriverId { get; set; }
    public int Status { get; set; }

    /// <summary>Posición actual del pasajero. Nullable porque la columna lo es.</summary>
    public double? Lat { get; set; }
    public double? Lng { get; set; }
    public DateTime? UpdatedAt { get; set; }

    /// <summary>Origen del viaje (NOT NULL en BD).</summary>
    public double OriginLat { get; set; }
    public double OriginLng { get; set; }
    /// <summary>Destino del viaje (NOT NULL en BD).</summary>
    public double DestLat { get; set; }
    public double DestLng { get; set; }

    /// <summary>Última posición conocida del conductor (nullable).</summary>
    public double? DriverLat { get; set; }
    public double? DriverLng { get; set; }

    /// <summary>Nombre del pasajero (de auth.Users, garantizado por ISNULL).</summary>
    public string PassengerName { get; set; } = string.Empty;
    /// <summary>Teléfono del pasajero (nullable, columna en auth.Users).</summary>
    public string? PassengerPhone { get; set; }
    /// <summary>URL de foto de perfil del pasajero (nullable, columna auth.Users.ProfilePhotoUrl).</summary>
    public string? PassengerPhotoUrl { get; set; }
    /// <summary>Nombre del conductor (null si no hay conductor asignado).</summary>
    public string? DriverName { get; set; }
    /// <summary>Teléfono del conductor (null si no hay conductor asignado).</summary>
    public string? DriverPhone { get; set; }
}
