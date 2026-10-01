namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Calificación que el pasajero da al conductor después de un viaje completado.
/// 1 a 5 estrellas, comentario opcional (máx 500 chars).
///
/// Reglas:
/// - Solo el pasajero del viaje puede calificar.
/// - Solo si el viaje está Completed.
/// - Solo una vez por viaje (UQ_TripRatings_TripId en BD).
/// </summary>
public class TripRating
{
    public Guid Id { get; private set; }
    public Guid TripId { get; private set; }
    public Guid PassengerId { get; private set; }   // UserId del pasajero
    public Guid DriverId { get; private set; }   // UserId del conductor (igual a Trip.DriverId)
    public byte Stars { get; private set; }   // 1..5
    public string? Comment { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private TripRating() { }

    public static TripRating Create(
        Guid tripId, Guid passengerId, Guid driverId, byte stars, string? comment)
    {
        if(stars < 1 || stars > 5)
            throw new ArgumentException(
                "La calificación debe estar entre 1 y 5 estrellas.", nameof(stars));

        // Trim + truncar comentario al límite del schema.
        string? cleanComment = null;
        if(!string.IsNullOrWhiteSpace(comment))
        {
            var trimmed = comment.Trim();
            cleanComment = trimmed.Length > 500 ? trimmed.Substring(0, 500) : trimmed;
        }

        return new TripRating
        {
            Id = Guid.NewGuid(),
            TripId = tripId,
            PassengerId = passengerId,
            DriverId = driverId,
            Stars = stars,
            Comment = cleanComment,
            CreatedAt = DateTime.UtcNow,
        };
    }
}
