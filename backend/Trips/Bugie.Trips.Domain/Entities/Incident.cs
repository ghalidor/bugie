namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Incidencia reportada por un pasajero o conductor sobre un viaje.
/// Constraint UNIQUE en BD: (TripId, ReportedByRole). Es decir, máximo
/// una incidencia del pasajero y una del conductor por viaje.
/// </summary>
public class Incident
{
    public Guid Id { get; private set; }
    public Guid TripId { get; private set; }
    public Guid ReportedByUserId { get; private set; }
    public string ReportedByRole { get; private set; } = "passenger";  // "passenger" | "driver"
    public string Description { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; private set; }

    private Incident() { }

    public static Incident Create(Guid tripId, Guid userId, string role, string description)
    {
        if(string.IsNullOrWhiteSpace(description))
            throw new ArgumentException("La descripción es obligatoria.", nameof(description));
        if(role != "passenger" && role != "driver")
            throw new ArgumentException("El rol debe ser 'passenger' o 'driver'.", nameof(role));

        return new Incident
        {
            Id = Guid.NewGuid(),
            TripId = tripId,
            ReportedByUserId = userId,
            ReportedByRole = role,
            Description = description.Trim(),
            CreatedAt = DateTime.UtcNow,
        };
    }
}