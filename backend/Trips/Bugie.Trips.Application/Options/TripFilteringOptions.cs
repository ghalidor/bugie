namespace Bugie.Trips.Application.Options;

/// <summary>
/// Opciones para filtrar qué viajes pending ve cada conductor.
/// Se enlaza con la sección "TripFiltering" del appsettings.json.
///
/// Ejemplo:
/// {
///   "TripFiltering": {
///     "NearbyRadiusMeters": 2000
///   }
/// }
/// </summary>
public class TripFilteringOptions
{
    /// <summary>
    /// Radio en metros para considerar un viaje "cercano" al conductor.
    /// Default: 2000 (2 km). El conductor solo verá viajes pending cuyo
    /// origen esté dentro de este radio de su posición actual.
    /// Excepción: viajes donde el conductor ya envió propuesta se muestran
    /// siempre, aunque estén fuera del rango.
    /// </summary>
    public int NearbyRadiusMeters { get; set; } = 2000;
}
