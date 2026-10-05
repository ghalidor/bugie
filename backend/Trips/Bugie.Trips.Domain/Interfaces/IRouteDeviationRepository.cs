using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Rutas planificadas y alertas de desvio de ruta.
/// </summary>
public interface IRouteDeviationRepository
{
    // ── Ruta planificada ──────────────────────────────────────────────────
    Task<TripPlannedRoute?> GetPlannedRouteAsync(Guid tripId, string leg, CancellationToken ct = default);

    /// <summary>Guarda la ruta del tramo. Si ya existia, no la reemplaza.</summary>
    Task SavePlannedRouteAsync(TripPlannedRoute route, CancellationToken ct = default);

    /// <summary>Actualiza el contador de lecturas seguidas fuera de la ruta.</summary>
    Task SetOffRouteStreakAsync(Guid routeId, int streak, CancellationToken ct = default);

    // ── Alertas ───────────────────────────────────────────────────────────
    Task<RouteDeviation?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<RouteDeviation?> GetOpenByTripAsync(Guid tripId, CancellationToken ct = default);

    /// <summary>
    /// Inserta la alerta. Devuelve false si ya habia una abierta para el viaje
    /// (indice unico parcial), asi no se repiten alertas.
    /// </summary>
    Task<bool> AddAsync(RouteDeviation deviation, CancellationToken ct = default);

    Task UpdateMaxDistanceAsync(Guid id, double distanceM, CancellationToken ct = default);

    /// <summary>Cierra la alerta (vuelta a la ruta o fin del viaje).</summary>
    Task CloseAsync(Guid id, string reason, CancellationToken ct = default);

    /// <summary>
    /// Cierra las alertas abiertas del conductor cuyo viaje ya no esta en curso.
    /// Devuelve las alertas cerradas.
    /// </summary>
    Task<List<RouteDeviation>> CloseOpenForEndedTripsAsync(Guid driverUserId, CancellationToken ct = default);

    Task<bool> ReviewAsync(Guid id, Guid adminUserId, string note, CancellationToken ct = default);

    /// <summary>
    /// Alertas sin revisar de viajes que siguen activos (o que siguen abiertas).
    /// </summary>
    Task<List<RouteDeviation>> GetActiveAsync(CancellationToken ct = default);

    Task<List<RouteDeviation>> GetByTripAsync(Guid tripId, CancellationToken ct = default);
}
