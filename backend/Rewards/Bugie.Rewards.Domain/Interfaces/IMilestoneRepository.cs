using Bugie.Rewards.Domain.Entities;

namespace Bugie.Rewards.Domain.Interfaces;

public interface IMilestoneRepository
{
    /// <summary>
    /// Registra que el usuario completó ese viaje, con la hora real del viaje
    /// (rewards.TripActivity). Cuenta aunque el viaje no dé puntos (p. ej.
    /// pagado 100% con cupón). Devuelve false si ya estaba registrado: un
    /// mismo viaje cuenta una sola vez.
    /// </summary>
    Task<bool> RecordTripAsync(
        Guid userId, Guid tripId, string userType, DateTime completedAtUtc,
        CancellationToken ct = default);

    /// <summary>
    /// Días (fecha de Perú, sin hora) en que el usuario completó viajes, hasta
    /// <paramref name="untilLocalDay"/> inclusive, del más reciente al más
    /// antiguo y sin repetir. Como máximo <paramref name="maxDays"/> días.
    /// </summary>
    Task<List<DateTime>> GetTripDaysAsync(
        Guid userId, DateTime untilLocalDay, int maxDays, CancellationToken ct = default);

    /// <summary>Viajes completados por el usuario en un rango (hora del viaje).</summary>
    Task<int> CountUserTripsAsync(
        Guid userId, DateTime fromUtc, DateTime toUtc, CancellationToken ct = default);

    /// <summary>
    /// true si el usuario tiene otro viaje (distinto de <paramref name="excludeTripId"/>)
    /// completado en ese rango. Sirve para "primer viaje del día".
    /// </summary>
    Task<bool> HasOtherTripInRangeAsync(
        Guid userId, DateTime fromUtc, DateTime toUtc, Guid excludeTripId,
        CancellationToken ct = default);

    /// <summary>Últimos logros del usuario, para mostrarlos en su pantalla.</summary>
    Task<List<MilestoneAward>> GetRecentAsync(
        Guid profileId, int take, CancellationToken ct = default);

    /// <summary>Último día (fecha de Perú) ya evaluado por el bono de día sin cancelar.</summary>
    Task<DateTime?> GetLastNoCancelDayAsync(CancellationToken ct = default);

    /// <summary>Deja constancia de que ese día ya se evaluó.</summary>
    Task MarkNoCancelDayAsync(
        DateTime localDay, int driversChecked, int awarded, CancellationToken ct = default);
}
