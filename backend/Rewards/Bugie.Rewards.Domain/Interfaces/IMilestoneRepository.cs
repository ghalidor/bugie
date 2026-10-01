using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface IMilestoneRepository
{
    /// <summary>
    /// Momentos (UTC) en que el usuario completó viajes desde esa fecha.
    /// La conversión a día local la hace quien llama, que es el único que
    /// conoce la zona horaria configurada.
    /// </summary>
    Task<List<DateTime>> GetTripTimesAsync(
        Guid profileId, DateTime sinceUtc, CancellationToken ct = default);

    /// <summary>Viajes completados en un rango.</summary>
    Task<int> CountTripsAsync(
        Guid profileId, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default);

    /// <summary>
    /// Registra el logro. Devuelve false si ya estaba pagado para ese periodo:
    /// ese es el candado contra pagar dos veces.
    /// </summary>
    Task<bool> TryAwardAsync(MilestoneAward award, CancellationToken ct = default);

    /// <summary>Últimos logros del usuario, para mostrarlos en su pantalla.</summary>
    Task<List<MilestoneAward>> GetRecentAsync(
        Guid profileId, int take, CancellationToken ct = default);
}
