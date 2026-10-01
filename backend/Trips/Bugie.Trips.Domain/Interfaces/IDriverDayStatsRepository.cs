namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Actividad de un conductor en un dia.
///
/// Con propiedades y no como record posicional: lo materializa Dapper desde
/// una consulta, y asi mapea por nombre en vez de depender del orden de las
/// columnas ni de que COUNT devuelva int en vez de bigint.
/// </summary>
public class DriverDayStats
{
    public Guid DriverId          { get; set; }
    public int  Completed         { get; set; }
    /// <summary>Cancelaciones hechas POR EL CONDUCTOR, no por el pasajero.</summary>
    public int  CancelledByDriver { get; set; }
}

/// <summary>
/// Resumen diario por conductor. Lo consume Rewards para el bono de trabajar
/// sin cancelar.
///
/// Va en su propia interfaz y no en ITripRepository porque es un reporte, no
/// una operacion sobre viajes.
/// </summary>
public interface IDriverDayStatsRepository
{
    /// <summary>
    /// Conductores con actividad en ese dia local, con sus viajes completados
    /// y sus cancelaciones.
    /// </summary>
    Task<List<DriverDayStats>> GetAsync(DateTime localDate, CancellationToken ct = default);
}
