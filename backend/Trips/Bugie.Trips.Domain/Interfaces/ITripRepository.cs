using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

public interface ITripRepository {
    Task<Trip?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Trip?> GetActiveTripAsync(Guid userId, CancellationToken ct = default);
    Task<List<Trip>> GetByPassengerAsync(Guid passengerId, CancellationToken ct = default);
    Task<List<Trip>> GetByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task<List<Trip>> GetPendingAsync(CancellationToken ct = default);

    /// <summary>
    /// Devuelve TODOS los viajes (uso administrativo).
    /// Ordenados por más reciente primero.
    /// </summary>
    Task<List<Trip>> GetAllAsync(CancellationToken ct = default);

    /// <summary>
    /// Lista paginada de viajes con filtros opcionales.
    /// - status: 1-7 (TripStatus). null = todos. Soporta lista para múltiples (ej. pending+negotiating).
    /// - search: matchea en OriginAddress o DestAddress (LIKE '%X%').
    /// Pensado para listas grandes (5000+ viajes).
    /// </summary>
    Task<(List<Trip> Items, int Total)> GetPagedAsync(
        int page, int pageSize, IEnumerable<int>? statuses, string? search,
        CancellationToken ct = default);

    /// <summary>
    /// KPIs agregados de viajes. 1 query con SUM(CASE WHEN..).
    /// Respeta los mismos filtros para reflejar lo que se está viendo.
    /// </summary>
    Task<(int Total, int Pending, int InProgress, int Completed, decimal TotalFare)>
        GetStatsAsync(IEnumerable<int>? statuses, string? search,
            CancellationToken ct = default);

    Task AddAsync(Trip trip, CancellationToken ct = default);
    Task UpdateAsync(Trip trip, CancellationToken ct = default);
    Task<List<Trip>> GetSosActiveAsync(CancellationToken ct = default);
    Task<List<TripWaypoint>> GetWaypointsAsync(Guid tripId, CancellationToken ct = default);
    Task SaveWaypointsAsync(Guid tripId, List<TripWaypoint> waypoints, CancellationToken ct = default);

    /// <summary>
    /// Dado un conjunto de UserIds de conductores, devuelve los que actualmente
    /// tienen un viaje activo (Status NOT IN Completed=4, Cancelled=5).
    /// Usado por Drivers.Api vía HTTP para mostrar en el mapa de monitoreo.
    /// </summary>
    Task<List<Guid>> GetDriversWithActiveTripAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default);

    /// <summary>
    /// Actualiza la última posición conocida del pasajero EN EL VIAJE ACTIVO.
    /// Hace UPDATE directo (no carga el Trip) porque se llama frecuentemente.
    /// Si el pasajero no tiene viaje activo, devuelve null (no hace nada).
    /// Si sí, devuelve el TripId actualizado (útil para broadcasts).
    /// </summary>
    Task<Guid?> UpdatePassengerLocationAsync(
        Guid passengerId, double lat, double lng, CancellationToken ct = default);

    /// <summary>
    /// Vista para el admin: viajes en curso con posición de pasajero conocida.
    /// Solo trae las columnas necesarias para pintar el mapa. Filtra Trips
    /// donde Status IN (1,2,3,6,7) y PassengerLastLat IS NOT NULL.
    /// </summary>
    Task<List<PassengerLiveLocation>> GetLivePassengerLocationsAsync(
        CancellationToken ct = default);
}