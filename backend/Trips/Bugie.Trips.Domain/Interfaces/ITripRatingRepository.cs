using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Repositorio de calificaciones de viajes.
/// </summary>
public interface ITripRatingRepository
{
    /// <summary>Crea una calificación. Si ya existe una para el TripId, devuelve null.</summary>
    Task<TripRating?> AddAsync(TripRating rating, CancellationToken ct = default);

    /// <summary>Devuelve la calificación de un viaje específico (o null).</summary>
    Task<TripRating?> GetByTripAsync(Guid tripId, CancellationToken ct = default);

    /// <summary>
    /// Lista paginada de calificaciones recibidas por un conductor, ordenadas por fecha desc.
    /// Page 1-based. PageSize típicamente 10-20.
    /// </summary>
    Task<List<TripRating>> ListByDriverAsync(
        Guid driverUserId, int page, int pageSize, CancellationToken ct = default);

    /// <summary>Total de calificaciones recibidas por un conductor (para paginación).</summary>
    Task<int> CountByDriverAsync(Guid driverUserId, CancellationToken ct = default);

    /// <summary>
    /// Devuelve un Map {tripId → TripRating} para una lista de TripIds.
    /// Solo incluye entradas que tienen calificación; los viajes sin
    /// rating NO aparecen en el resultado (no se devuelven como null).
    /// Usado por el historial del pasajero para evitar N llamadas paralelas.
    /// </summary>
    Task<Dictionary<Guid, TripRating>> GetByTripIdsAsync(
        IEnumerable<Guid> tripIds, CancellationToken ct = default);

    /// <summary>
    /// Promedio (2 decimales) y cantidad de calificaciones RECIBIDAS por cada
    /// conductor (UserId), calculado desde trips.TripRatings.
    /// Los conductores sin calificaciones NO aparecen en el resultado.
    /// </summary>
    Task<Dictionary<Guid, RatingStats>> GetDriverStatsAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default);
}

/// <summary>Promedio de estrellas (1..5, 2 decimales) y cantidad de calificaciones.</summary>
public record RatingStats(Guid UserId, decimal Average, int Count);
