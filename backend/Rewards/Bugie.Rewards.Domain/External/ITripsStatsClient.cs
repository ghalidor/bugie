namespace Bugie.Rewards.Domain.External;

/// <summary>Actividad de un conductor en un día, tal como la reporta Trips.</summary>
public record DriverDayStats(Guid DriverId, int Completed, int CancelledByDriver);

/// <summary>
/// Consulta a Trips el resumen diario de los conductores.
///
/// Es la única cosa que Rewards le pregunta a Trips. Todo lo demás llega por la
/// bandeja de salida, pero esto es un agregado del día: no hay un evento que
/// signifique "este conductor no canceló nada hoy".
/// </summary>
public interface ITripsStatsClient
{
    /// <summary>Null si Trips no responde. Nunca lanza excepción.</summary>
    Task<List<DriverDayStats>?> GetDriverDayAsync(
        DateTime localDate, CancellationToken ct = default);
}
