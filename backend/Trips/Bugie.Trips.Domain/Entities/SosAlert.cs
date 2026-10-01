namespace Bugie.Trips.Domain.Entities;

public class SosAlert
{
    public Guid Id { get; private set; }
    public Guid TripId { get; private set; }
    public Guid UserId { get; private set; }
    public string UserRole { get; private set; }
    public double Lat { get; private set; }
    public double Lng { get; private set; }
    public bool Resolved { get; private set; }
    public Guid? ResolvedBy { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? ResolvedAt { get; private set; }
    /// <summary>
    /// Motivo de desactivación que escribió el admin. Requerido para auditoría
    /// (saber por qué se cerró cada alerta: falsa alarma, atendida, etc.).
    /// </summary>
    public string? ResolutionReason { get; private set; }

    private SosAlert() { }

    public static SosAlert Create(Guid tripId, Guid userId,
                                   string userRole, double lat, double lng) => new()
                                   {
                                       Id = Guid.NewGuid(),
                                       TripId = tripId,
                                       UserId = userId,
                                       UserRole = userRole,
                                       Lat = lat,
                                       Lng = lng,
                                       Resolved = false,
                                       CreatedAt = DateTime.UtcNow,
                                   };

    /// <summary>
    /// Desactivar la alerta. El motivo es obligatorio para que quede registrado
    /// quién y por qué se cerró. La capa de presentación valida que no sea vacío.
    /// </summary>
    public void Resolve(Guid resolvedBy, string reason)
    {
        Resolved = true;
        ResolvedBy = resolvedBy;
        ResolvedAt = DateTime.UtcNow;
        ResolutionReason = reason;
    }

    /// <summary>
    /// Reconstruye una entidad SosAlert con todos sus campos desde la BD.
    /// Lo usa el repositorio para rehidratar entidades sin usar reflection.
    /// </summary>
    public static SosAlert Rehydrate(
        Guid id, Guid tripId, Guid userId, string userRole,
        double lat, double lng, bool resolved, Guid? resolvedBy,
        DateTime createdAt, DateTime? resolvedAt, string? resolutionReason) => new()
        {
            Id = id,
            TripId = tripId,
            UserId = userId,
            UserRole = userRole,
            Lat = lat,
            Lng = lng,
            Resolved = resolved,
            ResolvedBy = resolvedBy,
            CreatedAt = createdAt,
            ResolvedAt = resolvedAt,
            ResolutionReason = resolutionReason,
        };
}
