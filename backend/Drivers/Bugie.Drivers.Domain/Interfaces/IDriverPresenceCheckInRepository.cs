using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

public interface IDriverPresenceCheckInRepository
{
    Task<Guid> CreateAsync(DriverPresenceCheckIn entity, CancellationToken ct = default);

    /// <summary>
    /// Devuelve el check-in activo del conductor (sin CheckedOutAt).
    /// Null si no tiene sesión activa.
    /// </summary>
    Task<DriverPresenceCheckIn?> GetActiveAsync(Guid driverUserId, CancellationToken ct = default);

    /// <summary>
    /// Cierra TODOS los check-ins activos del conductor.
    /// Defensa por si quedó alguno colgado de una sesión anterior.
    /// </summary>
    Task CloseAllActiveAsync(Guid driverUserId, CancellationToken ct = default);

    /// <summary>
    /// Historial de conexiones del conductor, más reciente primero.
    /// fromUtc inclusivo, toUtc exclusivo (ambos opcionales, en UTC).
    /// </summary>
    Task<(List<DriverPresenceCheckIn> Items, int Total)> GetHistoryAsync(
        Guid driverUserId, DateTime? fromUtc, DateTime? toUtc,
        int page, int pageSize, CancellationToken ct = default);

    /// <summary>
    /// Cuántas conexiones empezaron desde cada fecha (UTC): hoy, últimos 7 y 30 días.
    /// </summary>
    Task<(int Today, int Last7Days, int Last30Days)> CountSinceAsync(
        Guid driverUserId, DateTime todayUtc, DateTime last7Utc, DateTime last30Utc,
        CancellationToken ct = default);
}
