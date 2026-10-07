namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Alerta de monitoreo detectada en el servidor (tabla trips.MonitorAlerts):
/// sin señal, detenido o viaje demorado. Abierta mientras ResolvedAt sea null;
/// se resuelve sola cuando la condición termina o el viaje deja de estar activo.
/// El admin la marca como revisada (no la cierra).
/// </summary>
public class MonitorAlert
{
    public const string TypeNoSignal    = "no_signal";
    public const string TypeLongStop    = "long_stop";
    public const string TypeTripDelayed = "trip_delayed";

    public Guid      Id         { get; set; }
    public Guid      TripId     { get; set; }
    /// <summary>UserId del conductor.</summary>
    public Guid      DriverId   { get; set; }
    public string    Type       { get; set; } = "";
    public DateTime  StartedAt  { get; set; }
    /// <summary>Última vez que la pasada confirmó la condición.</summary>
    public DateTime  LastSeenAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public Guid?     ReviewedBy { get; set; }
    public string?   ReviewNote { get; set; }
    /// <summary>JSON con el último valor medido (minutes, estimatedMin, etc.).</summary>
    public string?   Details    { get; set; }
}

/// <summary>Fila del listado admin de alertas de monitoreo (con nombres).</summary>
public class MonitorAlertListItem
{
    public Guid      Id             { get; set; }
    public Guid      TripId         { get; set; }
    public Guid      DriverId       { get; set; }
    public string?   DriverName     { get; set; }
    public string?   PassengerName  { get; set; }
    public string    Type           { get; set; } = "";
    public DateTime  StartedAt      { get; set; }
    public DateTime  LastSeenAt     { get; set; }
    public DateTime? ResolvedAt     { get; set; }
    public DateTime? ReviewedAt     { get; set; }
    public string?   ReviewedByName { get; set; }
    public string?   ReviewNote     { get; set; }
    /// <summary>Minutos de la condición en la última medición (de Details).</summary>
    public int?      Minutes        { get; set; }
    public string?   Details        { get; set; }
}

/// <summary>
/// Viaje que vigila el servicio de alertas de monitoreo (estado 2/3/6 con
/// conductor). Incluye la última posición del conductor guardada por Drivers
/// y la distancia de la ruta planificada (si ya existe).
/// </summary>
public class MonitorTripSnapshot
{
    public Guid      TripId              { get; set; }
    public Guid      DriverId            { get; set; }
    public Guid      PassengerId         { get; set; }
    public int       Status              { get; set; }
    public int       ServiceType         { get; set; }
    public DateTime  CreatedAt           { get; set; }
    public DateTime? AcceptedAt          { get; set; }
    public DateTime? StartedAt           { get; set; }
    public DateTime? ScheduledAt         { get; set; }
    public double    OriginLat           { get; set; }
    public double    OriginLng           { get; set; }
    public double    DestLat             { get; set; }
    public double    DestLng             { get; set; }
    public double?   DistanceKm          { get; set; }
    public string?   DriverName          { get; set; }
    /// <summary>drivers.Drivers.CurrentLat/Lng/CurrentLocationAt (UTC).</summary>
    public double?   DriverLat           { get; set; }
    public double?   DriverLng           { get; set; }
    public DateTime? DriverLocationAt    { get; set; }
    /// <summary>Distancia (m) de la ruta planificada del tramo 'trip', si existe.</summary>
    public double?   PlannedDistanceM    { get; set; }
}
