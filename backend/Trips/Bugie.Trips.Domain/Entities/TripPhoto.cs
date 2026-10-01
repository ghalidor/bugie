using Bugie.Trips.Domain.Enums;

namespace Bugie.Trips.Domain.Entities;

/// <summary>
/// Foto asociada a un envío (Trip con ServiceType.Delivery).
/// Cubre tanto las fotos del paquete que sube el cliente al solicitar,
/// como las fotos de verificación que toma el conductor al recoger.
/// </summary>
public class TripPhoto
{
    public Guid Id { get; set; }
    public Guid TripId { get; set; }

    /// <summary>Ruta/URL devuelta por el almacenamiento (mismo patrón que Auth/Drivers).</summary>
    public string Url { get; set; } = string.Empty;

    public TripPhotoKind Kind { get; set; }

    /// <summary>Quién subió la foto (cliente o conductor). Útil para auditoría.</summary>
    public Guid UploadedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public static TripPhoto Create(Guid tripId, string url, TripPhotoKind kind, Guid uploadedBy) => new()
    {
        Id = Guid.NewGuid(),
        TripId = tripId,
        Url = url,
        Kind = kind,
        UploadedBy = uploadedBy,
        CreatedAt = DateTime.UtcNow,
    };
}
