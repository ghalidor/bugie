namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Conductor marcado como favorito por un pasajero.
/// PK compuesta: un mismo (PassengerId, DriverUserId) no puede existir 2 veces.
/// </summary>
public class FavoriteDriver {
    public Guid PassengerId { get; set; }
    public Guid DriverUserId { get; set; }
    public DateTime CreatedAt { get; set; }
}
