namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Ruta planificada de un viaje (tabla trips.TripPlannedRoutes), una fila por tramo:
///   * 'pickup': posicion del conductor al aceptar -> punto de recojo.
///   * 'trip'  : recojo -> paradas -> destino (el tramo que se vigila).
/// Se calcula con GraphHopper; si no responde se usa la linea recta
/// (Source = 'straight').
/// </summary>
public class TripPlannedRoute
{
    public const string LegPickup = "pickup";
    public const string LegTrip   = "trip";

    public Guid      Id             { get; set; }
    public Guid      TripId         { get; set; }
    public string    Leg            { get; set; } = LegTrip;
    /// <summary>'graphhopper' o 'straight'.</summary>
    public string    Source         { get; set; } = "straight";
    /// <summary>Puntos de la ruta: cada item es [lat, lng].</summary>
    public List<double[]> Points    { get; set; } = new();
    public double?   DistanceMeters { get; set; }
    /// <summary>Lecturas GPS seguidas fuera de la ruta.</summary>
    public int       OffRouteStreak { get; set; }
    public DateTime  CreatedAt      { get; set; }
}
