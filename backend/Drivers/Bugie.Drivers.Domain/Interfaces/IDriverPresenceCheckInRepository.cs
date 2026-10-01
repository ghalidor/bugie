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
    /// Marca un check-in como cerrado (el conductor se desconectó).
    /// </summary>
    Task CloseAsync(Guid checkInId, CancellationToken ct = default);

    /// <summary>
    /// Cierra TODOS los check-ins activos del conductor.
    /// Defensa por si quedó alguno colgado de una sesión anterior.
    /// </summary>
    Task CloseAllActiveAsync(Guid driverUserId, CancellationToken ct = default);

    /// <summary>
    /// Historial paginado del conductor (más reciente primero). Para el admin.
    /// </summary>
    Task<List<DriverPresenceCheckIn>> GetHistoryAsync(
        Guid driverUserId, int skip, int take, CancellationToken ct = default);
}
