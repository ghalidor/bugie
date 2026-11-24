namespace Bugie.Drivers.Domain.Entities;

/// <summary>
/// Valores de la verificación facial (columnas facestatus, facereviewstatus,
/// faceresult y status de las fotos de perfil).
/// </summary>
public static class FaceCheck
{
    // Resultado de la comparación (conexiones y fotos de perfil)
    public const string Disabled = "disabled";        // interruptor apagado
    public const string Match = "match";
    public const string Mismatch = "mismatch";
    public const string NoReference = "no_reference"; // el conductor no tiene huella de referencia
    public const string Error = "error";              // sin rostro, imagen ilegible o faltan modelos

    // Revisión del admin de una conexión que no coincidió
    public const string ReviewPending = "pending";
    public const string ReviewConfirmedOk = "confirmed_ok"; // "Era él" (error del sistema)
    public const string ReviewNotHim = "not_him";            // "No era él": observación en la ficha

    // Estado de una foto de perfil subida
    public const string PhotoApproved = "approved";
    public const string PhotoPendingReview = "pending_review";
    public const string PhotoRejected = "rejected";
    public const string PhotoReplaced = "replaced";          // la reemplazó otra foto antes de revisarla
}

/// <summary>
/// Huella facial de referencia del conductor: la de su foto de perfil aprobada.
/// </summary>
public class DriverFaceReference
{
    public Guid DriverId { get; set; }
    /// <summary>NULL = la foto aprobada no tiene un rostro detectable.</summary>
    public float[]? Embedding { get; set; }
    public string? Model { get; set; }
    public string PhotoUrl { get; set; } = "";
    /// <summary>Ruta del archivo en el almacenamiento (para recalcular la huella).</summary>
    public string? FileId { get; set; }
    public Guid? AttemptId { get; set; }
    public bool AutoApproved { get; set; }
    /// <summary>Admin que la aprobó (NULL = automático).</summary>
    public Guid? ApprovedBy { get; set; }
    public string? ApprovedByName { get; set; }
    public DateTime ApprovedAt { get; set; }
}

/// <summary>
/// Cada foto de perfil que sube el conductor con la verificación facial
/// (foto, puntaje, estado y quién la revisó).
/// </summary>
public class DriverProfilePhotoAttempt
{
    public Guid Id { get; set; }
    public Guid DriverId { get; set; }
    public string PhotoUrl { get; set; } = "";
    public string? FileId { get; set; }
    /// <summary>Foto de perfil vigente cuando se subió esta.</summary>
    public string? PreviousPhotoUrl { get; set; }
    public float[]? Embedding { get; set; }
    public string? Model { get; set; }
    public float? Score { get; set; }
    public string FaceResult { get; set; } = FaceCheck.NoReference;
    public string? FaceError { get; set; }
    public string Status { get; set; } = FaceCheck.PhotoPendingReview;
    public bool AutoApproved { get; set; }
    /// <summary>Motivo del rechazo (lo ve el conductor).</summary>
    public string? Reason { get; set; }
    public Guid? ReviewedBy { get; set; }
    public string? ReviewedByName { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}
