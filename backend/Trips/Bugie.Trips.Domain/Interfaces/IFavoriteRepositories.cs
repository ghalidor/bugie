using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Conductores favoritos de un pasajero. Sin límite por usuario (decisión de producto).
/// </summary>
public interface IFavoriteDriverRepository {
    /// <summary>Lista los DriverUserId que el pasajero tiene como favoritos.</summary>
    Task<List<Guid>> GetByPassengerAsync(Guid passengerId, CancellationToken ct = default);

    /// <summary>True si el conductor está en los favoritos del pasajero.</summary>
    Task<bool> IsFavoriteAsync(Guid passengerId, Guid driverUserId, CancellationToken ct = default);

    /// <summary>
    /// Agrega un conductor a favoritos. Idempotente: si ya está, no falla
    /// (devuelve false), si se agregó, devuelve true.
    /// </summary>
    Task<bool> AddAsync(Guid passengerId, Guid driverUserId, CancellationToken ct = default);

    /// <summary>Quita el favorito. Si no existía, no falla.</summary>
    Task RemoveAsync(Guid passengerId, Guid driverUserId, CancellationToken ct = default);

    /// <summary>Cuántos pasajeros tienen a este conductor como favorito (admin/stats).</summary>
    Task<int> CountForDriverAsync(Guid driverUserId, CancellationToken ct = default);
}

/// <summary>
/// Direcciones favoritas de un pasajero (atajos al solicitar viaje).
/// </summary>
public interface IFavoriteAddressRepository {
    /// <summary>Lista todas las direcciones del pasajero, ordenadas por SortOrder.</summary>
    Task<List<FavoriteAddress>> GetByPassengerAsync(Guid passengerId, CancellationToken ct = default);

    Task<FavoriteAddress?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task AddAsync(FavoriteAddress address, CancellationToken ct = default);
    /// <summary>True si el pasajero ya tiene una direccion con ese nombre (case-insensitive).</summary>
    Task<bool> ExistsByLabelAsync(Guid passengerId, string label, Guid? excludeId, CancellationToken ct = default);
    Task UpdateAsync(FavoriteAddress address, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);

    /// <summary>SortOrder máximo del pasajero (para apendear nuevos al final).</summary>
    Task<int> GetMaxSortOrderAsync(Guid passengerId, CancellationToken ct = default);
}
