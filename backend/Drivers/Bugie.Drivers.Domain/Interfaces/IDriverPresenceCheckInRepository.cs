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

    // ── Verificación facial ─────────────────────────────────────────────

    Task<DriverPresenceCheckIn?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Conexiones con verificación facial (facestatus no NULL), más reciente primero.
    /// faceStatus / reviewStatus / driverUserId: filtros opcionales. fromUtc inclusivo, toUtc exclusivo.
    /// </summary>
    Task<(List<FaceCheckRow> Items, int Total)> GetFaceChecksPagedAsync(
        string? faceStatus, string? reviewStatus, Guid? driverUserId,
        DateTime? fromUtc, DateTime? toUtc, int page, int pageSize, CancellationToken ct = default);

    /// <summary>
    /// Revisión del admin de una conexión "no coincide". Solo si sigue pendiente
    /// (false = ya la revisó otro admin o no existe).
    /// </summary>
    Task<bool> ReviewFaceAsync(Guid id, string reviewStatus, string? note,
        Guid reviewedBy, string? reviewedByName, CancellationToken ct = default);

    Task<int> CountPendingFaceReviewsAsync(CancellationToken ct = default);
}

/// <summary>Conexión con verificación facial y el Id del conductor (para el admin).</summary>
public class FaceCheckRow : DriverPresenceCheckIn
{
    public Guid DriverId { get; set; }
}
