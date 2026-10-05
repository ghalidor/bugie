using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

public interface IDriverReviewRequestRepository
{
    /// <summary>
    /// Crea la solicitud. Si el conductor ya tiene una abierta lanza
    /// InvalidOperationException (lo garantiza un índice único en BD).
    /// </summary>
    Task AddAsync(DriverReviewRequest request, CancellationToken ct = default);

    /// <summary>Solicitud abierta del conductor, o NULL.</summary>
    Task<DriverReviewRequest?> GetOpenByDriverAsync(Guid driverId, CancellationToken ct = default);

    /// <summary>Solicitudes abiertas de varios conductores (para el listado del admin).</summary>
    Task<List<DriverReviewRequest>> GetOpenByDriversAsync(IEnumerable<Guid> driverIds, CancellationToken ct = default);

    /// <summary>
    /// Cierra la solicitud abierta del conductor (si hay) como accepted/rejected.
    /// Devuelve la solicitud cerrada o NULL si no había ninguna abierta.
    /// </summary>
    Task<DriverReviewRequest?> CloseOpenAsync(
        Guid driverId, string status, Guid? resolvedByUserId, string? resolvedByName,
        string? resolution, CancellationToken ct = default);
}
