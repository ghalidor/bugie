using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Alertas de monitoreo (trips.MonitorAlerts): sin señal, detenido y viaje
/// demorado. Las horas se ponen en SQL, en UTC.
/// </summary>
public interface IMonitorAlertRepository
{
    /// <summary>Viajes activos (2/3/6) con conductor, con su última posición conocida.</summary>
    Task<List<MonitorTripSnapshot>> GetMonitoredTripsAsync(CancellationToken ct = default);

    /// <summary>Alertas abiertas (ResolvedAt null).</summary>
    Task<List<MonitorAlert>> GetOpenAsync(CancellationToken ct = default);

    /// <summary>
    /// Abre una alerta. Devuelve null si ya hay una abierta del mismo tipo para
    /// ese viaje (índice único parcial).
    /// </summary>
    Task<MonitorAlert?> OpenAsync(Guid tripId, Guid driverId, string type, string detailsJson,
                                  CancellationToken ct = default);

    /// <summary>La condición sigue: actualiza LastSeenAt y Details.</summary>
    Task TouchAsync(Guid id, string detailsJson, CancellationToken ct = default);

    /// <summary>Marca resuelta. False si ya estaba resuelta.</summary>
    Task<bool> ResolveAsync(Guid id, CancellationToken ct = default);

    /// <summary>Página del listado admin, lo más reciente primero.</summary>
    Task<(List<MonitorAlertListItem> Items, int Total)> GetPageAsync(bool openOnly, int page, int pageSize,
                                                                    CancellationToken ct = default);

    /// <summary>
    /// Marca revisada (conserva la primera revisión). False si no existe.
    /// </summary>
    Task<bool> ReviewAsync(Guid id, Guid adminUserId, string? note, CancellationToken ct = default);
}
