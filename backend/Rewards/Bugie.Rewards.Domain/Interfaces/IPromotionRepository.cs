using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface IPromotionRepository
{
    /// <summary>Promociones vigentes para ese tipo de usuario, ya filtradas por fecha.</summary>
    Task<List<Promotion>> GetLiveAsync(string userType, CancellationToken ct = default);

    Task<List<Promotion>> GetAllAsync(CancellationToken ct = default);
    Task<Promotion?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task AddAsync(Promotion promotion, CancellationToken ct = default);
    Task UpdateAsync(Promotion promotion, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Deja constancia de qué promoción aportó cuántos puntos a qué viaje.
    /// Si el evento del viaje se reintenta, el índice único evita duplicar.
    /// </summary>
    Task LogApplicationsAsync(
        Guid profileId, Guid tripId,
        IEnumerable<(Guid PromotionId, int PointsAdded)> applications,
        CancellationToken ct = default);

    /// <summary>Cuántos puntos regaló cada promoción. Para medir el costo.</summary>
    Task<List<(Guid PromotionId, int Times, int TotalPoints)>> GetUsageAsync(
        CancellationToken ct = default);
}
