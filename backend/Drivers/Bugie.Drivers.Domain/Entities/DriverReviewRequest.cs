namespace Bugie.Drivers.Domain.Entities;

/// <summary>
/// Solicitud del conductor rechazado o suspendido para que el admin revise
/// su caso. Sin límite de veces, pero solo una abierta a la vez.
/// </summary>
public class DriverReviewRequest
{
    // Estados (columna Status)
    public const string StatusOpen = "open";
    public const string StatusAccepted = "accepted";   // el admin reactivó (o terminó la suspensión)
    public const string StatusRejected = "rejected";   // el admin mantuvo el rechazo/suspensión

    public Guid Id { get; private set; }
    public Guid DriverId { get; private set; }
    public string Message { get; private set; } = string.Empty;
    public string Status { get; private set; } = StatusOpen;
    /// <summary>Estado del conductor al pedir la revisión (4 Suspended o 5 Rejected).</summary>
    public short DriverStatus { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? ResolvedAt { get; private set; }
    public Guid? ResolvedByUserId { get; private set; }
    public string? ResolvedByName { get; private set; }
    public string? Resolution { get; private set; }

    private DriverReviewRequest() { }

    public static DriverReviewRequest Create(Guid driverId, string message, int driverStatus) => new()
    {
        Id = Guid.NewGuid(),
        DriverId = driverId,
        Message = message,
        Status = StatusOpen,
        DriverStatus = (short)driverStatus,
        CreatedAt = DateTime.UtcNow,
    };
}
