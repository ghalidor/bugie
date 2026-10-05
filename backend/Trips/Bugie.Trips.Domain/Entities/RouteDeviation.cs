namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Alerta de desvio de ruta (tabla trips.RouteDeviations).
/// Se abre cuando el conductor esta lejos de la ruta planificada varias
/// lecturas GPS seguidas y se cierra cuando vuelve a la ruta o termina el
/// viaje. El admin la marca como revisada con una nota.
/// </summary>
public class RouteDeviation
{
    public const string StatusOpen   = "open";
    public const string StatusClosed = "closed";

    public Guid      Id           { get; set; }
    public Guid      TripId       { get; set; }
    /// <summary>UserId del conductor.</summary>
    public Guid      DriverId     { get; set; }
    /// <summary>'pickup' o 'trip' (ver TripPlannedRoute).</summary>
    public string    Leg          { get; set; } = TripPlannedRoute.LegTrip;
    public double    Lat          { get; set; }
    public double    Lng          { get; set; }
    /// <summary>Distancia (m) a la ruta cuando se detecto.</summary>
    public double    DistanceM    { get; set; }
    /// <summary>Maxima distancia (m) mientras estuvo desviado.</summary>
    public double    MaxDistanceM { get; set; }
    public string    Status       { get; set; } = StatusOpen;
    /// <summary>back_on_route | trip_ended</summary>
    public string?   CloseReason  { get; set; }
    public DateTime  StartedAt    { get; set; }
    public DateTime? EndedAt      { get; set; }
    public Guid?     ReviewedBy   { get; set; }
    public DateTime? ReviewedAt   { get; set; }
    public string?   ReviewNote   { get; set; }
}
