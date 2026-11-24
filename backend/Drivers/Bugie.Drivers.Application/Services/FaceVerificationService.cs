using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using Microsoft.Extensions.Logging;
using System.Globalization;

namespace Bugie.Drivers.Application.Services;

/// <summary>Configuración vigente (landing.systemsettings).</summary>
public sealed record FaceSettings(bool Enabled, double Threshold, int DailyLimit);

/// <summary>Resultado de la verificación de una conexión (se guarda en la fila del check-in).</summary>
public sealed record CheckInFaceResult(
    string Status, float? Score, string? ReferencePhotoUrl, string? Model, string? Error);

/// <summary>
/// Respuesta de POST /api/drivers/profile/me/photo (contrato con la app).
/// LimitError != null = se pasó del límite diario (429).
/// </summary>
public sealed record ProfilePhotoUploadResult(
    string? PhotoUrl, string Status, string Message, int AttemptsLeftToday, string? LimitError = null);

/// <summary>
/// Verificación facial de conductores (interruptor face_verification_enabled):
///  - Conexión: compara la selfie con la huella de referencia (no bloquea nunca).
///  - Foto de perfil: se aprueba sola si coincide con la referencia; si no
///    coincide o es la primera, queda pendiente de revisión del admin.
///  - Revisión del admin: aprobar (pasa a perfil + nueva huella) o rechazar con motivo.
/// El motor de reconocimiento es IFaceRecognizer (intercambiable).
/// </summary>
public class FaceVerificationService
{
    public const string SettingEnabled = "face_verification_enabled";
    public const string SettingThreshold = "face_match_threshold";
    public const string SettingDailyLimit = "profile_photo_daily_limit";
    public const int DefaultDailyLimit = 3;

    // Caché corta de la configuración: el cambio en el admin se aplica en <= 30 s.
    private static FaceSettings? _cached;
    private static DateTime _cachedAt = DateTime.MinValue;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(30);

    private readonly IFaceRecognizer _recognizer;
    private readonly IDriverFaceRepository _faces;
    private readonly IDriverRepository _drivers;
    private readonly ILandingSettingsClient _settings;
    private readonly IDriveStorageService _storage;
    private readonly DriverDocumentsDeadlineService _deadline;
    private readonly IAdminEventsPublisher _adminEvents;
    private readonly IAuthClient _auth;
    private readonly ITripsNotifyClient _push;
    private readonly ILogger<FaceVerificationService> _log;

    public FaceVerificationService(
        IFaceRecognizer recognizer,
        IDriverFaceRepository faces,
        IDriverRepository drivers,
        ILandingSettingsClient settings,
        IDriveStorageService storage,
        DriverDocumentsDeadlineService deadline,
        IAdminEventsPublisher adminEvents,
        IAuthClient auth,
        ITripsNotifyClient push,
        ILogger<FaceVerificationService> log)
    {
        _recognizer = recognizer;
        _faces = faces;
        _drivers = drivers;
        _settings = settings;
        _storage = storage;
        _deadline = deadline;
        _adminEvents = adminEvents;
        _auth = auth;
        _push = push;
        _log = log;
    }

    /// <summary>Similitud (coseno) como "% de parecido" (0-100).</summary>
    public static int ToPercent(double score) => (int)Math.Round(Math.Clamp(score, 0, 1) * 100);

    // ── Configuración ────────────────────────────────────────────────────

    public async Task<FaceSettings> GetSettingsAsync(CancellationToken ct = default)
    {
        var cached = _cached;
        if(cached is not null && DateTime.UtcNow - _cachedAt < CacheTtl) return cached;

        // Si Landing no responde: apagado (todo sigue como antes).
        var enabled = string.Equals((await _settings.GetSettingAsync(SettingEnabled, ct))?.Trim(), "true",
            StringComparison.OrdinalIgnoreCase);
        var thrRaw = await _settings.GetSettingAsync(SettingThreshold, ct);
        var threshold = double.TryParse(thrRaw?.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var t)
                        && t > -1 && t < 1 ? t : _recognizer.DefaultThreshold;
        var limitRaw = await _settings.GetSettingAsync(SettingDailyLimit, ct);
        var limit = int.TryParse(limitRaw?.Trim(), out var l) && l >= 1 ? l : DefaultDailyLimit;

        var s = new FaceSettings(enabled, threshold, limit);
        _cached = s;
        _cachedAt = DateTime.UtcNow;
        return s;
    }

    // ── Conexión ("Conectarme" con selfie) ───────────────────────────────

    /// <summary>
    /// Compara la selfie de conexión con la huella de referencia. Nunca lanza
    /// excepción ni bloquea la conexión: cualquier falla queda como "error".
    /// </summary>
    public async Task<CheckInFaceResult> VerifyCheckInAsync(Driver driver, byte[] selfie, CancellationToken ct = default)
    {
        FaceSettings s;
        try { s = await GetSettingsAsync(ct); }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "Verificación facial: no se pudo leer la configuración.");
            return new CheckInFaceResult(FaceCheck.Disabled, null, null, null, null);
        }
        if(!s.Enabled) return new CheckInFaceResult(FaceCheck.Disabled, null, null, null, null);

        try
        {
            var reference = await _faces.GetReferenceAsync(driver.Id, ct);
            if(reference is null)
                return new CheckInFaceResult(FaceCheck.NoReference, null, null, null, null);

            var probe = await _recognizer.GetEmbeddingAsync(selfie, ct);
            if(!probe.Success)
            {
                if(probe.ErrorKind == FaceErrorKind.ModelUnavailable)
                    _log.LogWarning("Verificación facial ENCENDIDA pero sin modelos: la conexión del conductor {DriverId} queda como error.", driver.Id);
                return new CheckInFaceResult(FaceCheck.Error, null, reference.PhotoUrl, _recognizer.ModelName, probe.Error);
            }

            reference = await EnsureCurrentModelAsync(reference, ct);
            if(reference.Embedding is null)
                return new CheckInFaceResult(FaceCheck.NoReference, null, reference.PhotoUrl, _recognizer.ModelName,
                    "La foto de referencia no tiene un rostro detectable.");

            var score = (float)_recognizer.Compare(probe.Embedding!, reference.Embedding);
            return new CheckInFaceResult(score >= s.Threshold ? FaceCheck.Match : FaceCheck.Mismatch,
                score, reference.PhotoUrl, _recognizer.ModelName, null);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "Verificación facial: error en la conexión del conductor {DriverId}.", driver.Id);
            return new CheckInFaceResult(FaceCheck.Error, null, null, _recognizer.ModelName, "Error del reconocimiento facial.");
        }
    }

    /// <summary>Aviso en vivo al panel: la selfie no coincide (el conductor no se entera).</summary>
    public async Task NotifyMismatchAsync(Driver driver, float score, CancellationToken ct = default)
    {
        var name = await DriverNameAsync(driver.UserId, ct);
        _adminEvents.Publish("face_mismatch",
            "Selfie de conexión no coincide",
            $"{name} se conectó con una selfie que no coincide con su foto de referencia ({ToPercent(score)}% de parecido).",
            "/admin/verificacion-facial", "view:verification");
    }

    // ── Foto de perfil ───────────────────────────────────────────────────

    public async Task<ProfilePhotoUploadResult> UploadProfilePhotoAsync(
        Driver driver, byte[] bytes, string fileName, string mimeType, CancellationToken ct = default)
    {
        var s = await GetSettingsAsync(ct);
        var previous = driver.ProfilePhotoUrl;

        // Apagado: como siempre (directo a la foto de perfil). Queda registrado.
        if(!s.Enabled)
        {
            var direct = await UploadAsync(bytes, fileName, mimeType, $"drivers/{driver.Id}/profile", ct);
            await SetProfilePhotoAsync(driver, direct.PreviewUrl, ct);
            await _faces.AddAttemptAsync(new DriverProfilePhotoAttempt
            {
                DriverId = driver.Id,
                PhotoUrl = direct.PreviewUrl,
                FileId = direct.DriveFileId,
                PreviousPhotoUrl = previous,
                FaceResult = FaceCheck.Disabled,
                Status = FaceCheck.PhotoApproved,
            }, ct);
            return new ProfilePhotoUploadResult(direct.PreviewUrl, FaceCheck.PhotoApproved,
                "Tu foto de perfil se actualizó.", s.DailyLimit);
        }

        // Límite diario (día de Perú).
        var used = await _faces.CountAttemptsSinceAsync(driver.Id, BugieTime.PeruToUtc(BugieTime.Today), ct);
        if(used >= s.DailyLimit)
        {
            var fotos = s.DailyLimit == 1 ? "1 foto" : $"{s.DailyLimit} fotos";
            return new ProfilePhotoUploadResult(previous, FaceCheck.PhotoPendingReview, "", 0,
                $"Ya subiste {fotos} hoy. Podrás intentar de nuevo mañana.");
        }
        var attemptsLeft = Math.Max(0, s.DailyLimit - used - 1);

        // Huella de la foto nueva y comparación con la referencia aprobada.
        var probe = await _recognizer.GetEmbeddingAsync(bytes, ct);
        var reference = await _faces.GetReferenceAsync(driver.Id, ct);
        if(reference is not null && probe.Success)
            reference = await EnsureCurrentModelAsync(reference, ct);

        float? score = null;
        string result;
        if(!probe.Success) result = FaceCheck.Error;
        else if(reference?.Embedding is null) result = FaceCheck.NoReference;
        else
        {
            score = (float)_recognizer.Compare(probe.Embedding!, reference.Embedding);
            result = score >= s.Threshold ? FaceCheck.Match : FaceCheck.Mismatch;
        }
        if(probe.ErrorKind == FaceErrorKind.ModelUnavailable)
            _log.LogWarning("Verificación facial ENCENDIDA pero sin modelos: la foto de perfil del conductor {DriverId} queda para revisión.", driver.Id);

        var attempt = new DriverProfilePhotoAttempt
        {
            Id = Guid.NewGuid(),
            DriverId = driver.Id,
            PreviousPhotoUrl = previous,
            Embedding = probe.Embedding,
            Model = probe.Success ? _recognizer.ModelName : null,
            Score = score,
            FaceResult = result,
            FaceError = probe.Error,
        };

        // Coincide con su foto aprobada: se aprueba sola.
        if(result == FaceCheck.Match)
        {
            var stored = await UploadAsync(bytes, fileName, mimeType, $"drivers/{driver.Id}/profile", ct);
            await _faces.ReplacePendingAsync(driver.Id, ct);
            attempt.PhotoUrl = stored.PreviewUrl;
            attempt.FileId = stored.DriveFileId;
            attempt.Status = FaceCheck.PhotoApproved;
            attempt.AutoApproved = true;
            attempt.ReviewedAt = DateTime.UtcNow;
            await _faces.AddAttemptAsync(attempt, ct);
            await _faces.UpsertReferenceAsync(new DriverFaceReference
            {
                DriverId = driver.Id,
                Embedding = probe.Embedding,
                Model = _recognizer.ModelName,
                PhotoUrl = stored.PreviewUrl,
                FileId = stored.DriveFileId,
                AttemptId = attempt.Id,
                AutoApproved = true,
                ApprovedAt = DateTime.UtcNow,
            }, ct);
            await SetProfilePhotoAsync(driver, stored.PreviewUrl, ct);
            return new ProfilePhotoUploadResult(stored.PreviewUrl, FaceCheck.PhotoApproved,
                "Tu foto de perfil se actualizó.", attemptsLeft);
        }

        // No coincide, es la primera o no se pudo analizar: revisión del admin.
        // Mientras tanto sigue la foto aprobada anterior (perfil y referencia).
        var pending = await UploadAsync(bytes, fileName, mimeType, $"drivers/{driver.Id}/profile-pending", ct);
        await _faces.ReplacePendingAsync(driver.Id, ct);
        attempt.PhotoUrl = pending.PreviewUrl;
        attempt.FileId = pending.DriveFileId;
        attempt.Status = FaceCheck.PhotoPendingReview;
        await _faces.AddAttemptAsync(attempt, ct);

        var name = await DriverNameAsync(driver.UserId, ct);
        _adminEvents.Publish("profile_photo_review",
            "Foto de perfil por revisar",
            reference is null
                ? $"{name} subió su primera foto de perfil."
                : $"{name} subió una foto de perfil nueva que no se pudo aprobar sola.",
            "/admin/verificacion-facial?tab=fotos", "view:verification");

        return new ProfilePhotoUploadResult(previous, FaceCheck.PhotoPendingReview,
            "Recibimos tu foto. El equipo de Bugie la revisará y te avisaremos si hay algún problema.", attemptsLeft);
    }

    /// <summary>
    /// El admin aprueba una foto pendiente: pasa a ser la foto de perfil y su
    /// huella la nueva referencia. Devuelve false si la foto no tiene un rostro
    /// detectable (se aprueba igual, pero las conexiones quedarán "sin referencia").
    /// KeyNotFoundException (404) / InvalidOperationException (409).
    /// </summary>
    public async Task<bool> ApproveAttemptAsync(Guid attemptId, Guid adminId, string? adminName, CancellationToken ct = default)
    {
        var a = await _faces.GetAttemptAsync(attemptId, ct)
                ?? throw new KeyNotFoundException("Foto no encontrada.");
        if(a.Status != FaceCheck.PhotoPendingReview)
            throw new InvalidOperationException("Esta foto ya fue revisada o la reemplazó otra más nueva.");
        var driver = await _drivers.GetByIdAsync(a.DriverId, ct)
                     ?? throw new KeyNotFoundException("Conductor no encontrado.");

        var bytes = a.FileId is null ? null : await ReadFileAsync(a.FileId, ct);
        if(bytes is null) throw new InvalidOperationException("No se encontró el archivo de la foto.");

        var embedding = a.Model == _recognizer.ModelName ? a.Embedding : null;
        if(embedding is null)
        {
            var r = await _recognizer.GetEmbeddingAsync(bytes, ct);
            embedding = r.Embedding;
        }

        // Copia pública en la carpeta de perfil (la pendiente no es pública).
        var stored = await UploadAsync(bytes, "perfil.jpg", "image/jpeg", $"drivers/{driver.Id}/profile", ct);
        if(!await _faces.ReviewAttemptAsync(attemptId, FaceCheck.PhotoApproved, null, adminId, adminName, ct))
        {
            try { await _storage.DeleteAsync(stored.DriveFileId, ct); } catch { /* copia huérfana: no crítico */ }
            throw new InvalidOperationException("Esta foto ya fue revisada o la reemplazó otra más nueva.");
        }

        await _faces.UpsertReferenceAsync(new DriverFaceReference
        {
            DriverId = driver.Id,
            Embedding = embedding,
            Model = _recognizer.ModelName,
            PhotoUrl = stored.PreviewUrl,
            FileId = stored.DriveFileId,
            AttemptId = attemptId,
            AutoApproved = false,
            ApprovedBy = adminId,
            ApprovedByName = adminName,
            ApprovedAt = DateTime.UtcNow,
        }, ct);
        await SetProfilePhotoAsync(driver, stored.PreviewUrl, ct);
        return embedding is not null;
    }

    /// <summary>
    /// El admin rechaza una foto pendiente (motivo obligatorio, 5-300). Push y
    /// bandeja al conductor. Errores: ArgumentException (400), 404, 409.
    /// </summary>
    public async Task RejectAttemptAsync(Guid attemptId, string? reason, Guid adminId, string? adminName, CancellationToken ct = default)
    {
        var motivo = (reason ?? "").Trim();
        if(motivo.Length < 5 || motivo.Length > 300)
            throw new ArgumentException("Escribe el motivo del rechazo (entre 5 y 300 caracteres).");

        var a = await _faces.GetAttemptAsync(attemptId, ct)
                ?? throw new KeyNotFoundException("Foto no encontrada.");
        var driver = await _drivers.GetByIdAsync(a.DriverId, ct)
                     ?? throw new KeyNotFoundException("Conductor no encontrado.");
        if(!await _faces.ReviewAttemptAsync(attemptId, FaceCheck.PhotoRejected, motivo, adminId, adminName, ct))
            throw new InvalidOperationException("Esta foto ya fue revisada o la reemplazó otra más nueva.");

        await _push.SendPushAsync(driver.UserId,
            "Foto de perfil no aprobada",
            $"Tu foto de perfil no fue aprobada: {motivo.TrimEnd('.', ' ')}. Sube una foto tuya.",
            DriverPush.Data(DriverPush.ProfilePhotoRejected, DriverPush.RouteProfile), ct);
    }

    // ── Apoyo ────────────────────────────────────────────────────────────

    /// <summary>
    /// Si la huella de referencia es de otro motor (se cambió el modelo), se
    /// recalcula con la foto aprobada y se guarda. Si no se puede (sin rostro),
    /// queda sin huella.
    /// </summary>
    private async Task<DriverFaceReference> EnsureCurrentModelAsync(DriverFaceReference r, CancellationToken ct)
    {
        if(r.Model == _recognizer.ModelName) return r;

        var bytes = r.FileId is null ? null : await ReadFileAsync(r.FileId, ct);
        var res = bytes is null ? null : await _recognizer.GetEmbeddingAsync(bytes, ct);
        if(res is { ErrorKind: FaceErrorKind.ModelUnavailable or FaceErrorKind.Failure })
        {
            r.Embedding = null;      // falla temporal: no se guarda
            return r;
        }
        r.Embedding = res?.Embedding;
        r.Model = _recognizer.ModelName;
        await _faces.UpsertReferenceAsync(r, ct);
        _log.LogInformation("Verificación facial: huella de referencia del conductor {DriverId} recalculada con {Model}.",
            r.DriverId, r.Model);
        return r;
    }

    private async Task<StoredFile> UploadAsync(byte[] bytes, string fileName, string mimeType, string folder, CancellationToken ct)
    {
        using var ms = new MemoryStream(bytes, writable: false);
        return await _storage.UploadAsync(ms, fileName, mimeType, folder, ct);
    }

    private async Task<byte[]?> ReadFileAsync(string fileId, CancellationToken ct)
    {
        try
        {
            await using var stream = await _storage.DownloadAsync(fileId, ct);
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms, ct);
            return ms.ToArray();
        }
        catch(Exception ex)
        {
            _log.LogWarning("Verificación facial: no se pudo leer {FileId}: {Error}", fileId, ex.Message);
            return null;
        }
    }

    private async Task SetProfilePhotoAsync(Driver driver, string url, CancellationToken ct)
    {
        driver.SetProfilePhoto(url);
        await _drivers.UpdateAsync(driver, ct);
        // La foto de perfil es requisito: si era lo último que faltaba en una
        // aprobación por excepción, se cierra el plazo.
        try { await _deadline.CloseDeadlineIfCompleteAsync(driver, ct); }
        catch { /* el plazo se revisa también al aprobar documentos y en el job */ }
    }

    private async Task<string> DriverNameAsync(Guid userId, CancellationToken ct)
    {
        try
        {
            var users = await _auth.GetUsersByIdsAsync(new[] { userId }, ct);
            if(users.TryGetValue(userId, out var u) && !string.IsNullOrWhiteSpace(u.FullName)) return u.FullName;
        }
        catch { /* sin nombre: no rompe el flujo */ }
        return "Un conductor";
    }
}
