namespace Bugie.Drivers.Domain.Entities;

/// <summary>
/// Documento subido por un conductor (DNI, licencia, SOAT, etc.)
/// </summary>
public class DriverDocument
{
    public Guid Id { get; private set; }
    public Guid DriverId { get; private set; }
    public string DocType { get; private set; }
    public string FileUrl { get; private set; }
    public string? DriveFileId { get; private set; }
    public string? OriginalFileName { get; private set; }
    public string? MimeType { get; private set; }
    public long? SizeBytes { get; private set; }
    public string Status { get; private set; }  // pending | approved | rejected | superseded
    public string? RejectionReason { get; private set; }
    public DateTime? ExpiresAt { get; private set; }
    public DateTime? ReviewedAt { get; private set; }
    public Guid? ReviewedBy { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private DriverDocument() { }

    public static DriverDocument Create(
        Guid driverId, string docType, string fileUrl,
        string driveFileId, string originalFileName, string mimeType, long sizeBytes,
        DateTime? expiresAt = null) => new()
        {
            Id = Guid.NewGuid(),
            DriverId = driverId,
            DocType = docType,
            FileUrl = fileUrl,
            DriveFileId = driveFileId,
            OriginalFileName = originalFileName,
            MimeType = mimeType,
            SizeBytes = sizeBytes,
            Status = "pending",
            ExpiresAt = expiresAt,
            CreatedAt = DateTime.UtcNow,
        };

    public void Approve(Guid reviewedBy)
    {
        Status = "approved";
        ReviewedAt = DateTime.UtcNow;
        ReviewedBy = reviewedBy;
        RejectionReason = null;
    }

    public void Reject(Guid reviewedBy, string? reason = null)
    {
        Status = "rejected";
        ReviewedAt = DateTime.UtcNow;
        ReviewedBy = reviewedBy;
        RejectionReason = reason;
    }

    /// <summary>
    /// Marca el documento como histórico. Usado cuando se sube un reemplazo
    /// (caducado o rechazo) y se quiere conservar la traza.
    /// </summary>
    public void Supersede()
    {
        Status = "superseded";
    }

    /// <summary>
    /// Actualiza los datos del archivo (usado solo cuando NO se conserva histórico).
    /// Mantenido por compatibilidad.
    /// </summary>
    public void UpdateFile(string fileUrl, string driveFileId,
                            string originalFileName, string mimeType, long sizeBytes,
                            DateTime? expiresAt = null)
    {
        FileUrl = fileUrl;
        DriveFileId = driveFileId;
        OriginalFileName = originalFileName;
        MimeType = mimeType;
        SizeBytes = sizeBytes;
        Status = "pending";
        ExpiresAt = expiresAt;
        ReviewedAt = null;
        ReviewedBy = null;
        RejectionReason = null;
    }
}