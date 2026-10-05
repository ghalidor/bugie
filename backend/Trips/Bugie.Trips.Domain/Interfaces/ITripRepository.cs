using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

public interface ITripRepository {
    Task<Trip?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Trip?> GetActiveTripAsync(Guid userId, CancellationToken ct = default);
    Task<List<Trip>> GetByPassengerAsync(Guid passengerId, CancellationToken ct = default);
    Task<List<Trip>> GetByDriverAsync(Guid driverId, CancellationToken ct = default);
    Task<List<Trip>> GetPendingAsync(CancellationToken ct = default);

    /// <summary>
    /// Mapa de demanda del conductor: pendientes/negociando creados en los ultimos
    /// <paramref name="minutes"/> minutos, dentro del radio, agrupados en celdas
    /// de ~500 m (lat/lng redondeados a 0.005). Envios sin foto del paquete no cuentan.
    /// </summary>
    Task<List<DemandZone>> GetDemandZonesAsync(double lat, double lng, double radiusMeters,
        int minutes, CancellationToken ct = default);

    /// <summary>
    /// Lista paginada de viajes para el admin con los filtros de <see cref="TripAdminFilter"/>.
    /// Pensado para listas grandes (5000+ viajes).
    /// </summary>
    Task<(List<Trip> Items, int Total)> GetPagedAsync(
        int page, int pageSize, TripAdminFilter filter, CancellationToken ct = default);

    /// <summary>
    /// KPIs agregados de viajes. 1 query con SUM(CASE WHEN..).
    /// Respeta los mismos filtros para reflejar lo que se está viendo.
    /// </summary>
    Task<(int Total, int Pending, int InProgress, int Completed, decimal TotalFare)>
        GetStatsAsync(TripAdminFilter filter, CancellationToken ct = default);

    // ---- Programados ----

    /// <summary>
    /// Programados vigentes del usuario (como pasajero o como conductor asignado),
    /// en estado Pending/Negotiating/Accepted, ordenados por hora programada.
    /// </summary>
    Task<List<Trip>> GetScheduledByUserAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Otro programado del conductor (aceptado o en curso) cuya hora queda a
    /// menos de marginMinutes de scheduledAtUtc. null = no hay choque.
    /// </summary>
    Task<Trip?> GetDriverScheduledConflictAsync(
        Guid driverUserId, DateTime scheduledAtUtc, Guid exceptTripId, int marginMinutes,
        CancellationToken ct = default);

    /// <summary>
    /// Otro programado propio del pasajero (pendiente, negociando, aceptado o en curso)
    /// cuya hora queda a menos de marginMinutes de scheduledAtUtc. null = no hay choque.
    /// </summary>
    Task<Trip?> GetPassengerScheduledConflictAsync(
        Guid passengerId, DateTime scheduledAtUtc, Guid exceptTripId, int marginMinutes,
        CancellationToken ct = default);

    /// <summary>
    /// Programados SIN conductor (pendientes / negociando) cuya hora es dentro de
    /// withinMinutes o ya paso. Sirven para avisar "aun no hay conductor" y para
    /// cancelar los vencidos.
    /// </summary>
    Task<List<Trip>> GetUnassignedScheduledDueAsync(
        DateTime nowUtc, int withinMinutes, CancellationToken ct = default);

    /// <summary>
    /// Cancela (cancelledBy = 'system') un programado vencido solo si sigue sin
    /// conductor (pendiente / negociando). Atomico: si en el mismo instante un
    /// conductor lo tomo, no hace nada. true = se cancelo.
    /// </summary>
    Task<bool> CancelExpiredScheduledAsync(Guid tripId, string reason, CancellationToken ct = default);

    /// <summary>Programados aceptados con algun recordatorio (30 / 10 min) pendiente de enviar.</summary>
    Task<List<Trip>> GetScheduledForRemindersAsync(DateTime nowUtc, CancellationToken ct = default);

    /// <summary>Marca un recordatorio como enviado (minutes = 30 o 10).</summary>
    Task MarkReminderSentAsync(Guid tripId, int minutes, CancellationToken ct = default);

    /// <summary>
    /// UserIds de TODOS los conductores conectados y aprobados (sin filtro de
    /// distancia). Se usa para avisar los envios.
    /// </summary>
    Task<List<Guid>> GetOnlineApprovedDriverUserIdsAsync(CancellationToken ct = default);

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

/// <summary>
/// Filtros del listado admin de viajes (todos opcionales).
/// - Statuses: 1-7 (TripStatus); varios = cualquiera de ellos.
/// - Search: dirección de origen/destino, pasajero o conductor (nombre, correo,
///   documento o celular) y placa del vehículo.
/// - ServiceType: 0 = viaje, 1 = envío. Scheduled: true = programados, false = "ahora".
/// - PassengerId / DriverUserId: viajes de un pasajero o de un conductor (UserId).
/// - FromUtc / ToUtc: rango de CreatedAt en UTC (ToUtc excluyente).
/// </summary>
public record TripAdminFilter(
    IEnumerable<int>? Statuses = null,
    string? Search = null,
    int? ServiceType = null,
    bool? Scheduled = null,
    Guid? PassengerId = null,
    Guid? DriverUserId = null,
    DateTime? FromUtc = null,
    DateTime? ToUtc = null);
