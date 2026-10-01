using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface IPointsTransactionRepository
{
    /// <summary>
    /// true si el usuario ya ganó puntos por otro viaje en el día local
    /// indicado. Sirve para la promoción de "primer viaje del día".
    /// Se excluye el viaje actual, que puede llegar varias veces.
    /// </summary>
    Task<bool> HasEarnedOnDayAsync(
        Guid profileId, DateTime dayStartUtc, DateTime dayEndUtc,
        Guid excludeTripId, CancellationToken ct = default);

    Task<(List<PointsTransaction> Items, int Total)> GetByProfileAsync(
        Guid profileId, int page, int pageSize, CancellationToken ct = default);
}
