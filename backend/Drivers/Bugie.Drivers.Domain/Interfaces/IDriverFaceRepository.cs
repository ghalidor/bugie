using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

/// <summary>
/// Verificación facial: huella de referencia del conductor
/// (drivers.driverfacereferences) e intentos de foto de perfil
/// (drivers.driverprofilephotoattempts).
/// </summary>
public interface IDriverFaceRepository
{
    Task<DriverFaceReference?> GetReferenceAsync(Guid driverId, CancellationToken ct = default);
    Task UpsertReferenceAsync(DriverFaceReference reference, CancellationToken ct = default);

    Task AddAttemptAsync(DriverProfilePhotoAttempt attempt, CancellationToken ct = default);
    Task<DriverProfilePhotoAttempt?> GetAttemptAsync(Guid id, CancellationToken ct = default);

    /// <summary>Último intento del conductor (cualquier estado).</summary>
    Task<DriverProfilePhotoAttempt?> GetLatestAttemptAsync(Guid driverId, CancellationToken ct = default);

    /// <summary>Intentos con la verificación encendida (faceresult distinto de disabled) desde sinceUtc.</summary>
    Task<int> CountAttemptsSinceAsync(Guid driverId, DateTime sinceUtc, CancellationToken ct = default);

    /// <summary>La foto pendiente del conductor (si hay) pasa a "replaced".</summary>
    Task ReplacePendingAsync(Guid driverId, CancellationToken ct = default);

    Task<bool> HasPendingAsync(Guid driverId, CancellationToken ct = default);

    /// <summary>
    /// Aprueba o rechaza una foto pendiente. Solo si sigue pendiente
    /// (false = ya la revisó otro admin o la reemplazó una nueva).
    /// </summary>
    Task<bool> ReviewAttemptAsync(Guid id, string status, string? reason,
        Guid reviewedBy, string? reviewedByName, CancellationToken ct = default);

    /// <summary>Intentos, más reciente primero. Filtros opcionales; fromUtc inclusivo, toUtc exclusivo.</summary>
    Task<(List<DriverProfilePhotoAttempt> Items, int Total)> GetAttemptsPagedAsync(
        string? status, Guid? driverId, DateTime? fromUtc, DateTime? toUtc,
        int page, int pageSize, CancellationToken ct = default);

    Task<int> CountPendingAttemptsAsync(CancellationToken ct = default);
}
