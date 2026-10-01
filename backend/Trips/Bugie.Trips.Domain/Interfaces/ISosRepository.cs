using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

public interface ISosRepository
{
    Task<SosAlert?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<SosAlert>> GetActiveAsync(CancellationToken ct = default);
    Task AddAsync(SosAlert alert, CancellationToken ct = default);
    Task UpdateAsync(SosAlert alert, CancellationToken ct = default);

    /// <summary>
    /// True si el viaje tiene OTRAS alertas SOS activas (no resueltas)
    /// además de la que pasamos en exceptId. Se usa al resolver una alerta
    /// para decidir si el viaje vuelve a su estado normal o sigue en SosActive
    /// (porque quizás el pasajero Y el conductor activaron SOS por separado
    /// y solo se resolvió uno).
    /// </summary>
    Task<bool> HasActiveByTripExceptAsync(
        Guid tripId, Guid exceptId, CancellationToken ct = default);

    /// <summary>
    /// Marca como resueltas TODAS las alertas activas del viaje en una sola
    /// query. Devuelve cuántas se actualizaron. Útil para que el admin
    /// "limpie" alertas huérfanas (de activaciones anteriores que no se
    /// resolvieron a tiempo) con una sola acción.
    /// </summary>
    Task<int> ResolveAllActiveByTripAsync(
        Guid tripId, Guid adminId, string reason, CancellationToken ct = default);
}
