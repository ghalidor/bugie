using Bugie.Drivers.Domain.Enums;

namespace Bugie.Drivers.Domain.Entities;

public class Driver
{
    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public DriverStatus Status { get; private set; }
    public bool IsOnline { get; private set; }
    public double? CurrentLat { get; private set; }
    public double? CurrentLng { get; private set; }
    /// <summary>
    /// Timestamp UTC del Ãºltimo GPS recibido. Sirve para el heartbeat-timeout:
    /// si el conductor no reporta GPS en N minutos, un background service
    /// lo marca offline automÃ¡ticamente (evita que conductores que cierran
    /// la app queden "online" para siempre).
    /// </summary>
    public DateTime? CurrentLocationAt { get; private set; }
    public string? FaceIdPhotoUrl { get; private set; }   // Verificación facial diaria
    public string? ProfilePhotoUrl { get; private set; }   // Foto de perfil (editable por el conductor)
    public decimal Rating { get; private set; }
    public int TotalRatings { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? ApprovedAt { get; private set; }
    /// <summary>
    /// Fecha límite (UTC) para completar documentos cuando el admin aprobó
    /// por excepción. NULL = sin plazo pendiente.
    /// </summary>
    public DateTime? DocumentsDeadline { get; private set; }
    /// <summary>Faltas acumuladas por no completar documentos a tiempo.</summary>
    public int Strikes { get; private set; }
    /// <summary>
    /// Fin de la suspensión en UTC (23:59:59 hora de Perú del día elegido).
    /// NULL = suspensión indefinida o no suspendido.
    /// </summary>
    public DateTime? SuspendedUntil { get; private set; }
    /// <summary>Motivo del último rechazo/suspensión (lo ve el conductor).</summary>
    public string? StatusReason { get; private set; }

    private Driver() { }

    public static Driver Create(Guid userId) => new()
    {
        Id = Guid.NewGuid(),
        UserId = userId,
        Status = DriverStatus.PendingDocs,
        IsOnline = false,
        Rating = 5.00m,
        TotalRatings = 0,
        CreatedAt = DateTime.UtcNow,
    };

    public void Approve() { Status = DriverStatus.Approved; ApprovedAt = DateTime.UtcNow; }

    /// <summary>
    /// Aprobación por excepción: el conductor queda aprobado pero con un plazo
    /// para completar los documentos que le faltan.
    /// </summary>
    public void ApproveWithDeadline(DateTime deadlineUtc)
    {
        Approve();
        DocumentsDeadline = deadlineUtc;
    }

    /// <summary>Completó sus documentos: se borra el plazo.</summary>
    public void ClearDocumentsDeadline() => DocumentsDeadline = null;

    /// <summary>
    /// No completó los documentos en el plazo: queda suspendido (offline),
    /// se le suma una falta y se borra el plazo.
    /// </summary>
    public void DeactivateForMissingDocuments()
    {
        Suspend();
        Strikes++;
        DocumentsDeadline = null;
        SuspendedUntil = null;
        StatusReason = "No completaste tus documentos dentro del plazo.";
    }

    /// <summary>
    /// El admin no aceptó el registro: queda rechazado y desconectado.
    /// </summary>
    public void RejectRegistration(string reason)
    {
        Status = DriverStatus.Rejected;
        IsOnline = false;
        StatusReason = reason;
        SuspendedUntil = null;
    }

    /// <summary>
    /// El admin suspende a un conductor aprobado (untilUtc NULL = indefinida).
    /// Conserva viajes, calificaciones, billetera y puntos.
    /// </summary>
    public void SuspendAccount(string reason, DateTime? untilUtc)
    {
        Status = DriverStatus.Suspended;
        IsOnline = false;
        StatusReason = reason;
        SuspendedUntil = untilUtc;
    }

    /// <summary>
    /// Sale del rechazo/suspensión al estado indicado (lo calcula
    /// DriverAccountService según sus documentos). Limpia motivo, fin de
    /// suspensión y plazo de documentos.
    /// </summary>
    public void Reactivate(DriverStatus newStatus)
    {
        Status = newStatus;
        StatusReason = null;
        SuspendedUntil = null;
        DocumentsDeadline = null;
        if(newStatus == DriverStatus.Approved) ApprovedAt ??= DateTime.UtcNow;
    }
    public void Reject() => Status = DriverStatus.Rejected;
    public void Suspend() { Status = DriverStatus.Suspended; IsOnline = false; }
    public void SubmitForReview() => Status = DriverStatus.UnderReview;

    /// <summary>
    /// Marca al conductor como tener documentos vencidos.
    /// Se desconecta automáticamente para no aceptar más viajes.
    /// </summary>
    public void MarkAsExpired()
    {
        Status = DriverStatus.ExpiredDocs;
        IsOnline = false;
    }

    /// <summary>
    /// El conductor subió un documento nuevo: vuelve a UnderReview hasta que admin apruebe.
    /// </summary>
    public void BackToReview()
    {
        Status = DriverStatus.UnderReview;
    }

    public void GoOnline(double lat, double lng)
    {
        if(Status != DriverStatus.Approved)
            throw new InvalidOperationException("El conductor debe estar aprobado para conectarse.");
        IsOnline = true;
        CurrentLat = lat;
        CurrentLng = lng;
        CurrentLocationAt = DateTime.UtcNow;
    }

    public void GoOffline() { IsOnline = false; }

    public void UpdateLocation(double lat, double lng)
    {
        CurrentLat = lat;
        CurrentLng = lng;
        CurrentLocationAt = DateTime.UtcNow;
    }

    public void SetFaceId(string url) => FaceIdPhotoUrl = url;

    /// <summary>
    /// Asigna o cambia la foto de perfil del conductor.
    /// No afecta la foto de FaceId que se usa para verificación.
    /// </summary>
    public void SetProfilePhoto(string url) => ProfilePhotoUrl = url;

    public void AddRating(int stars)
    {
        TotalRatings++;
        Rating = ((Rating * (TotalRatings - 1)) + stars) / TotalRatings;
    }
}