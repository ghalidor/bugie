using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using System.Security.Claims;
using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using Bugie.Drivers.Application.Services;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Verificación facial del conductor antes de ponerse online ("check-in").
///
/// Flujo desde el cliente Flutter:
///   1. POST /me/presence/checkin (multipart con la selfie)
///      → backend valida, guarda la foto, crea fila en BD, devuelve { id, photoUrl }.
///   2. Cliente llama al endpoint go-online tradicional usando el dato del paso 1
///      (el dato se usa solo del lado cliente; el backend valida que exista un
///      check-in activo del conductor antes de aceptar el go-online).
///   3. Cuando se desconecta, /me/presence/checkout cierra el check-in activo.
/// </summary>
[ApiController]
[Route("api/drivers/me/presence")]
[Authorize]
public class PresenceController : ControllerBase
{
    private readonly IDriverPresenceCheckInRepository _checkIns;
    private readonly IDriverRepository _drivers;
    private readonly IDriveStorageService _storage;
    private readonly FaceVerificationService _face;

    public PresenceController(
        IDriverPresenceCheckInRepository checkIns,
        IDriverRepository drivers,
        IDriveStorageService storage,
        FaceVerificationService face)
    {
        _checkIns = checkIns;
        _drivers = drivers;
        _storage = storage;
        _face = face;
    }

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// POST /api/drivers/me/presence/checkin
    ///
    /// El conductor sube su selfie de verificación facial. Si todo OK, queda
    /// registrada una fila ACTIVA en DriverPresenceCheckIns. A partir de ese
    /// momento el conductor puede llamar a go-online.
    ///
    /// Body: multipart/form-data
    ///   - file: el JPG/PNG de la selfie (max 5 MB).
    ///   - faceQualityScore (opcional): float 0-1 que devolvió el ML Kit del cliente.
    ///   - liveness (opcional): "passed" si la app hizo la prueba de vida.
    ///
    /// Verificación facial (interruptor face_verification_enabled): la selfie se
    /// compara con la foto de referencia del conductor. Es INTERNA: la respuesta
    /// no cambia y nunca bloquea la conexión; si no coincide se avisa al admin.
    /// </summary>
    [HttpPost("checkin")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB hard cap defensivo
    public async Task<IActionResult> CheckIn(
        IFormFile file,
        [FromForm] decimal? faceQualityScore,
        [FromForm] string? liveness,
        CancellationToken ct)
    {
        // Validaciones básicas del archivo. Las mismas que UploadMyProfilePhoto.
        if(file is null || file.Length == 0)
            return BadRequest(new { error = "Archivo vacío." });

        var allowed = new[] { "image/jpeg", "image/jpg", "image/png", "image/webp" };
        if(!allowed.Contains(file.ContentType.ToLowerInvariant()))
            return BadRequest(new { error = "Solo se permiten imágenes JPG, PNG o WEBP." });

        if(file.Length > 5 * 1024 * 1024)
            return BadRequest(new { error = "La imagen no puede pesar más de 5 MB." });

        if(Bugie.Drivers.Api.Security.UploadCheck.Error(file) is { } fileError)
            return BadRequest(new { error = fileError });

        // El conductor debe existir y estar aprobado para poder hacer check-in.
        // Aunque go-online ya valida esto, lo chequeamos acá también para no
        // gastar storage en conductores no aprobados (defensa en profundidad).
        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        // Rechazado o suspendido: no puede conectarse (no se guarda la selfie).
        var blocked = Bugie.Drivers.Application.Commands.GoOnlineHandler.ConnectBlockedMessage(driver.Status);
        if(blocked is not null) return Conflict(new { error = blocked });

        // Defensa: si por algún motivo había un check-in activo (cliente que se
        // colgó sin avisar checkout, o doble check-in), lo cerramos primero.
        // Así nunca quedan dos activos para el mismo conductor.
        await _checkIns.CloseAllActiveAsync(CurrentUserId, ct);

        // La selfie se lee una vez (máx. 5 MB): se guarda y se usa para la verificación.
        byte[] bytes;
        await using(var input = file.OpenReadStream())
        using(var buffer = new MemoryStream())
        {
            await input.CopyToAsync(buffer, ct);
            bytes = buffer.ToArray();
        }

        // Subimos la foto al storage. La guardamos junto a las otras fotos del
        // conductor (carpeta drivers/{id}/presence) para que sea fácil de auditar.
        StoredFile stored;
        using(var stream = new MemoryStream(bytes, writable: false))
        {
            stored = await _storage.UploadAsync(
                stream,
                originalFileName: file.FileName,
                mimeType: file.ContentType,
                folderPath: $"drivers/{driver.Id}/presence",
                ct);
        }

        // Verificación facial (apagada = "disabled"; nunca lanza excepción).
        var face = await _face.VerifyCheckInAsync(driver, bytes, ct);
        var livenessValue = string.IsNullOrWhiteSpace(liveness) ? null : liveness.Trim();
        if(livenessValue is { Length: > 20 }) livenessValue = livenessValue[..20];

        // Creamos el registro.
        var checkIn = new DriverPresenceCheckIn
        {
            Id = Guid.NewGuid(),
            DriverUserId = CurrentUserId,
            PhotoUrl = stored.PreviewUrl,
            CheckedInAt = DateTime.UtcNow,
            CheckedOutAt = null,
            FaceQualityScore = faceQualityScore,
            CreatedAt = DateTime.UtcNow,
            Liveness = livenessValue,
            FaceStatus = face.Status,
            FaceScore = face.Score,
            FaceModel = face.Model,
            FaceReferencePhotoUrl = face.ReferencePhotoUrl,
            FaceError = face.Error,
            FaceReviewStatus = face.Status == FaceCheck.Mismatch ? FaceCheck.ReviewPending : null,
        };
        await _checkIns.CreateAsync(checkIn, ct);

        // No coincide: el conductor sigue trabajando; se avisa al admin.
        if(face.Status == FaceCheck.Mismatch)
            await _face.NotifyMismatchAsync(driver, face.Score ?? 0, ct);

        return Ok(new
        {
            id = checkIn.Id,
            photoUrl = checkIn.PhotoUrl,
            checkedInAt = checkIn.CheckedInAt,
            faceQualityScore = checkIn.FaceQualityScore,
        });
    }

    /// <summary>
    /// POST /api/drivers/me/presence/checkout
    ///
    /// Cierra el check-in activo del conductor (al desconectarse).
    /// Si no hay activo, no falla — devuelve 200 igual.
    /// </summary>
    [HttpPost("checkout")]
    public async Task<IActionResult> CheckOut(CancellationToken ct)
    {
        await _checkIns.CloseAllActiveAsync(CurrentUserId, ct);
        return Ok(new { closed = true });
    }

    /// <summary>
    /// GET /api/drivers/me/presence/active
    ///
    /// Devuelve el check-in activo del conductor si lo tiene, sino null.
    /// El cliente Flutter lo usa para restaurar el preview de la foto cuando
    /// se reabre la app y el conductor sigue online.
    /// </summary>
    [HttpGet("active")]
    public async Task<IActionResult> GetActive(CancellationToken ct)
    {
        var active = await _checkIns.GetActiveAsync(CurrentUserId, ct);
        if(active is null) return Ok(new { active = (object?)null });
        return Ok(new
        {
            active = new
            {
                id = active.Id,
                photoUrl = active.PhotoUrl,
                checkedInAt = active.CheckedInAt,
            }
        });
    }

    // ── Historial de conexiones ─────────────────────────────────────────────

    public record PresenceHistoryItemDto(
        Guid Id, string PhotoUrl, DateTime CheckedInAt, DateTime? CheckedOutAt,
        int DurationMinutes, bool Active, decimal? FaceQualityScore);

    public record PresenceSummaryDto(int Today, int Last7Days, int Last30Days);

    public record PresenceHistoryDto(
        List<PresenceHistoryItemDto> Items, int Total, int Page, int PageSize, PresenceSummaryDto Summary);

    /// <summary>
    /// Conexión vista por el admin: además, el resultado de la verificación facial
    /// (faceStatus: disabled | match | mismatch | no_reference | error | null = antes
    /// de la verificación; faceMatchPercent = % de parecido) y la revisión del admin.
    /// </summary>
    public record AdminPresenceHistoryItemDto(
        Guid Id, string PhotoUrl, DateTime CheckedInAt, DateTime? CheckedOutAt,
        int DurationMinutes, bool Active, decimal? FaceQualityScore,
        string? Liveness, string? FaceStatus, float? FaceScore, int? FaceMatchPercent,
        string? FaceReferencePhotoUrl, string? FaceError,
        string? FaceReviewStatus, string? FaceReviewNote, string? FaceReviewedByName, DateTime? FaceReviewedAt);

    public record AdminPresenceHistoryDto(
        List<AdminPresenceHistoryItemDto> Items, int Total, int Page, int PageSize, PresenceSummaryDto Summary);

    /// <summary>
    /// GET /api/drivers/me/presence/history?page=1&amp;pageSize=20&amp;from=yyyy-MM-dd&amp;to=yyyy-MM-dd
    ///
    /// Conexiones ("Conectarme" con selfie) del conductor actual, más reciente primero.
    /// from/to: fechas de Perú, inclusivas y opcionales. pageSize máximo 100.
    /// summary: conexiones de hoy, últimos 7 y 30 días (fechas de Perú).
    /// </summary>
    [HttpGet("history")]
    public Task<IActionResult> History(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        CancellationToken ct = default) =>
        BuildHistory(CurrentUserId, page, pageSize, from, to, admin: false, ct);

    /// <summary>
    /// GET /api/drivers/admin/{driverId}/presence?page=1&amp;pageSize=20&amp;from=yyyy-MM-dd&amp;to=yyyy-MM-dd
    ///
    /// Mismo historial para el admin. driverId = Id del conductor (el del detalle);
    /// también acepta el UserId del conductor.
    /// </summary>
    [HttpGet("~/api/drivers/admin/{driverId:guid}/presence")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewDrivers)]
    public async Task<IActionResult> AdminHistory(
        Guid driverId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        CancellationToken ct = default)
    {
        var driver = await _drivers.GetByIdAsync(driverId, ct)
                  ?? await _drivers.GetByUserIdAsync(driverId, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });
        return await BuildHistory(driver.UserId, page, pageSize, from, to, admin: true, ct);
    }

    /// <summary>admin = true agrega la verificación facial (el conductor no la ve).</summary>
    private async Task<IActionResult> BuildHistory(
        Guid driverUserId, int page, int pageSize, DateOnly? from, DateOnly? to, bool admin, CancellationToken ct)
    {
        if(from.HasValue && to.HasValue && from > to)
            return BadRequest(new { error = "La fecha «desde» no puede ser mayor que «hasta»." });

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        // Fechas de Perú -> límites en UTC (to inclusivo: hasta el inicio del día siguiente).
        DateTime? fromUtc = from.HasValue ? BugieTime.PeruToUtc(from.Value.ToDateTime(TimeOnly.MinValue)) : null;
        DateTime? toUtc = to.HasValue ? BugieTime.PeruToUtc(to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue)) : null;

        var (items, total) = await _checkIns.GetHistoryAsync(driverUserId, fromUtc, toUtc, page, pageSize, ct);

        var today = BugieTime.Today;
        var (cToday, c7, c30) = await _checkIns.CountSinceAsync(
            driverUserId,
            BugieTime.PeruToUtc(today),
            BugieTime.PeruToUtc(today.AddDays(-6)),
            BugieTime.PeruToUtc(today.AddDays(-29)),
            ct);

        var now = DateTime.UtcNow;
        var summary = new PresenceSummaryDto(cToday, c7, c30);
        int Minutes(DriverPresenceCheckIn c) =>
            (int)Math.Max(0, Math.Floor(((c.CheckedOutAt ?? now) - c.CheckedInAt).TotalMinutes));

        if(admin)
        {
            return Ok(new AdminPresenceHistoryDto(
                items.Select(c => new AdminPresenceHistoryItemDto(
                    c.Id, c.PhotoUrl, c.CheckedInAt, c.CheckedOutAt,
                    Minutes(c), c.CheckedOutAt is null, c.FaceQualityScore,
                    c.Liveness, c.FaceStatus, c.FaceScore,
                    c.FaceScore is { } sc ? FaceVerificationService.ToPercent(sc) : null,
                    c.FaceReferencePhotoUrl, c.FaceError,
                    c.FaceReviewStatus, c.FaceReviewNote, c.FaceReviewedByName, c.FaceReviewedAt)).ToList(),
                total, page, pageSize, summary));
        }

        var dto = new PresenceHistoryDto(
            items.Select(c =>
            {
                var end = c.CheckedOutAt ?? now;
                var minutes = (int)Math.Max(0, Math.Floor((end - c.CheckedInAt).TotalMinutes));
                return new PresenceHistoryItemDto(
                    c.Id, c.PhotoUrl, c.CheckedInAt, c.CheckedOutAt,
                    minutes, c.CheckedOutAt is null, c.FaceQualityScore);
            }).ToList(),
            total, page, pageSize,
            new PresenceSummaryDto(cToday, c7, c30));

        return Ok(dto);
    }
}
