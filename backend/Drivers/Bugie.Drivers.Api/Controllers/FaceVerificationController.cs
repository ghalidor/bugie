using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Bugie.Security;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Common;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Verificación facial de conductores (panel admin, interno: el conductor no ve
/// los resultados).
///
///   GET  /api/drivers/admin/face/summary                 pendientes de cada pestaña + configuración
///   GET  /api/drivers/admin/face/checkins                conexiones verificadas (filtros: review, status, from, to)
///   POST /api/drivers/admin/face/checkins/{id}/review    { decision: "ok" | "not_him", note }
///   GET  /api/drivers/admin/face/photos                  fotos de perfil subidas (filtros: status, from, to)
///   POST /api/drivers/admin/face/photos/{id}/approve
///   POST /api/drivers/admin/face/photos/{id}/reject      { reason }
///   GET  /api/drivers/admin/{driverId}/face              referencia, foto pendiente y observaciones (ficha)
///
/// from/to: fechas de Perú (yyyy-MM-dd, inclusivas). pageSize máximo 100.
/// Permisos: revisar = view:verification; la ficha = view:drivers o view:verification.
/// Errores: { error } con 400, 404 o 409.
/// </summary>
[ApiController]
[Route("api/drivers/admin/face")]
[Authorize(Roles = "admin")]
public class FaceVerificationController : ControllerBase
{
    private readonly IDriverPresenceCheckInRepository _checkIns;
    private readonly IDriverFaceRepository _faces;
    private readonly IDriverRepository _drivers;
    private readonly IDocumentRepository _docs;
    private readonly IAuthClient _auth;
    private readonly FaceVerificationService _face;

    public FaceVerificationController(
        IDriverPresenceCheckInRepository checkIns,
        IDriverFaceRepository faces,
        IDriverRepository drivers,
        IDocumentRepository docs,
        IAuthClient auth,
        FaceVerificationService face)
    {
        _checkIns = checkIns;
        _faces = faces;
        _drivers = drivers;
        _docs = docs;
        _auth = auth;
        _face = face;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string? CurrentUserName => User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Email);

    public record SummaryDto(int PendingCheckIns, int PendingPhotos, bool Enabled, double Threshold, int DailyLimit);

    public record FaceCheckDto(
        Guid Id, Guid DriverId, Guid DriverUserId, string DriverName,
        string PhotoUrl, string? ReferencePhotoUrl,
        string? FaceStatus, float? FaceScore, int? MatchPercent, string? Liveness, string? FaceError,
        DateTime CheckedInAt, DateTime? CheckedOutAt,
        string? ReviewStatus, string? ReviewNote, string? ReviewedByName, DateTime? ReviewedAt);

    public record PhotoAttemptDto(
        Guid Id, Guid DriverId, Guid? DriverUserId, string DriverName,
        string PhotoUrl, string? PreviousPhotoUrl, string? CurrentPhotoUrl, string? DniFrontUrl,
        string FaceResult, float? Score, int? MatchPercent, string? FaceError,
        string Status, bool AutoApproved, string? Reason, string? ReviewedByName, DateTime? ReviewedAt,
        DateTime CreatedAt);

    public record PagedDto<T>(List<T> Items, int Total, int Page, int PageSize);

    public record ReviewCheckInRequest(string? Decision, string? Note);
    public record RejectPhotoRequest(string? Reason);

    // ── Resumen ──────────────────────────────────────────────────────────

    [HttpGet("summary")]
    [RequirePermission(Perm.ViewVerification)]
    public async Task<IActionResult> Summary(CancellationToken ct)
    {
        var s = await _face.GetSettingsAsync(ct);
        return Ok(new SummaryDto(
            await _checkIns.CountPendingFaceReviewsAsync(ct),
            await _faces.CountPendingAttemptsAsync(ct),
            s.Enabled, s.Threshold, s.DailyLimit));
    }

    // ── Conexiones ───────────────────────────────────────────────────────

    /// <summary>
    /// review: pending | confirmed_ok | not_him (vacío = todas).
    /// status: match | mismatch | no_reference | error | disabled (vacío = todos).
    /// </summary>
    [HttpGet("checkins")]
    [RequirePermission(Perm.ViewVerification)]
    public async Task<IActionResult> CheckIns(
        [FromQuery] string? review = null, [FromQuery] string? status = null,
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        if(Range(from, to, out var fromUtc, out var toUtc) is { } bad) return bad;
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var (items, total) = await _checkIns.GetFaceChecksPagedAsync(
            OrNull(status), OrNull(review), null, fromUtc, toUtc, page, pageSize, ct);
        var names = await NamesAsync(items.Select(i => i.DriverUserId), ct);
        return Ok(new PagedDto<FaceCheckDto>(items.Select(c => ToDto(c, names)).ToList(), total, page, pageSize));
    }

    /// <summary>
    /// "ok" = Era él (error del sistema): queda aprobada. "not_him" = No era él:
    /// queda como observación en la ficha del conductor (nota obligatoria, 10-500).
    /// </summary>
    [HttpPost("checkins/{id:guid}/review")]
    [RequirePermission(Perm.ViewVerification)]
    public async Task<IActionResult> ReviewCheckIn(Guid id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ReviewCheckInRequest? body, CancellationToken ct)
    {
        var decision = (body?.Decision ?? "").Trim().ToLowerInvariant();
        var note = string.IsNullOrWhiteSpace(body?.Note) ? null : body!.Note!.Trim();
        string reviewStatus;
        if(decision == "ok") reviewStatus = FaceCheck.ReviewConfirmedOk;
        else if(decision == "not_him")
        {
            reviewStatus = FaceCheck.ReviewNotHim;
            if(note is null || note.Length < 10)
                return BadRequest(new { error = "Escribe una nota de al menos 10 caracteres: quedará como observación en la ficha del conductor." });
        }
        else return BadRequest(new { error = "Decisión no válida (ok o not_him)." });
        if(note is { Length: > 500 }) return BadRequest(new { error = "La nota no puede pasar de 500 caracteres." });

        var c = await _checkIns.GetByIdAsync(id, ct);
        if(c is null) return NotFound(new { error = "Conexión no encontrada." });
        if(!await _checkIns.ReviewFaceAsync(id, reviewStatus, note, CurrentUserId, CurrentUserName, ct))
            return Conflict(new { error = "Esta conexión ya fue revisada." });
        return Ok(new { reviewed = true, reviewStatus });
    }

    // ── Fotos de perfil ──────────────────────────────────────────────────

    /// <summary>status: pending_review | approved | rejected | replaced (vacío = todas).</summary>
    [HttpGet("photos")]
    [RequirePermission(Perm.ViewVerification)]
    public async Task<IActionResult> Photos(
        [FromQuery] string? status = null,
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        if(Range(from, to, out var fromUtc, out var toUtc) is { } bad) return bad;
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var (items, total) = await _faces.GetAttemptsPagedAsync(OrNull(status), null, fromUtc, toUtc, page, pageSize, ct);

        // Conductor (foto vigente y DNI frontal para comparar) de cada fila.
        var drivers = new Dictionary<Guid, (Driver? Driver, string? Dni)>();
        foreach(var id in items.Select(i => i.DriverId).Distinct())
        {
            var d = await _drivers.GetByIdAsync(id, ct);
            var dni = await _docs.GetActiveByDriverAndTypeAsync(id, "dni_front", ct);
            drivers[id] = (d, dni?.FileUrl);
        }
        var names = await NamesAsync(drivers.Values.Where(v => v.Driver is not null).Select(v => v.Driver!.UserId), ct);

        var dtos = items.Select(a =>
        {
            var (d, dni) = drivers[a.DriverId];
            var name = d is not null && names.TryGetValue(d.UserId, out var n) ? n : "Conductor";
            return new PhotoAttemptDto(
                a.Id, a.DriverId, d?.UserId, name,
                a.PhotoUrl, a.PreviousPhotoUrl, d?.ProfilePhotoUrl, dni,
                a.FaceResult, a.Score, a.Score is { } sc ? FaceVerificationService.ToPercent(sc) : null, a.FaceError,
                a.Status, a.AutoApproved, a.Reason, a.ReviewedByName, a.ReviewedAt, a.CreatedAt);
        }).ToList();
        return Ok(new PagedDto<PhotoAttemptDto>(dtos, total, page, pageSize));
    }

    /// <summary>Aprueba la foto: pasa a ser su foto de perfil y su nueva referencia.</summary>
    [HttpPost("photos/{id:guid}/approve")]
    [RequirePermission(Perm.ViewVerification)]
    public Task<IActionResult> ApprovePhoto(Guid id, CancellationToken ct) =>
        Run(async () =>
        {
            var hasFace = await _face.ApproveAttemptAsync(id, CurrentUserId, CurrentUserName, ct);
            return new { approved = true, hasFace };
        });

    /// <summary>Rechaza la foto (motivo 5-300). El conductor recibe push y aviso en su bandeja.</summary>
    [HttpPost("photos/{id:guid}/reject")]
    [RequirePermission(Perm.ViewVerification)]
    public Task<IActionResult> RejectPhoto(Guid id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] RejectPhotoRequest? body, CancellationToken ct) =>
        Run(async () =>
        {
            await _face.RejectAttemptAsync(id, body?.Reason, CurrentUserId, CurrentUserName, ct);
            return new { rejected = true };
        });

    // ── Ficha del conductor ──────────────────────────────────────────────

    /// <summary>
    /// GET /api/drivers/admin/{driverId}/face — foto de referencia (quién y cuándo
    /// la aprobó), foto pendiente y observaciones ("No era él").
    /// driverId = Id del conductor (también acepta su UserId).
    /// </summary>
    [HttpGet("~/api/drivers/admin/{driverId:guid}/face")]
    [RequirePermission(Perm.ViewDrivers, Perm.ViewVerification)]
    public async Task<IActionResult> DriverFace(Guid driverId, CancellationToken ct)
    {
        var driver = await _drivers.GetByIdAsync(driverId, ct) ?? await _drivers.GetByUserIdAsync(driverId, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        var s = await _face.GetSettingsAsync(ct);
        var reference = await _faces.GetReferenceAsync(driver.Id, ct);
        var last = await _faces.GetLatestAttemptAsync(driver.Id, ct);
        var (observations, _) = await _checkIns.GetFaceChecksPagedAsync(
            null, FaceCheck.ReviewNotHim, driver.UserId, null, null, 1, 100, ct);
        var names = await NamesAsync(new[] { driver.UserId }, ct);

        return Ok(new
        {
            enabled = s.Enabled,
            threshold = s.Threshold,
            reference = reference is null ? null : new
            {
                photoUrl = reference.PhotoUrl,
                hasEmbedding = reference.Embedding is not null,
                autoApproved = reference.AutoApproved,
                approvedByName = reference.ApprovedByName,
                approvedAt = reference.ApprovedAt,
            },
            pendingPhoto = last is { Status: FaceCheck.PhotoPendingReview } ? new
            {
                id = last.Id,
                photoUrl = last.PhotoUrl,
                faceResult = last.FaceResult,
                matchPercent = last.Score is { } sc ? FaceVerificationService.ToPercent(sc) : (int?)null,
                createdAt = last.CreatedAt,
            } : null,
            observations = observations.Select(c => ToDto(c, names)).ToList(),
        });
    }

    // ── Apoyo ────────────────────────────────────────────────────────────

    private static string? OrNull(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    private IActionResult? Range(DateOnly? from, DateOnly? to, out DateTime? fromUtc, out DateTime? toUtc)
    {
        fromUtc = from.HasValue ? BugieTime.PeruToUtc(from.Value.ToDateTime(TimeOnly.MinValue)) : null;
        toUtc = to.HasValue ? BugieTime.PeruToUtc(to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue)) : null;
        return from.HasValue && to.HasValue && from > to
            ? BadRequest(new { error = "La fecha «desde» no puede ser mayor que «hasta»." })
            : null;
    }

    private async Task<Dictionary<Guid, string>> NamesAsync(IEnumerable<Guid> userIds, CancellationToken ct)
    {
        var ids = userIds.Distinct().ToList();
        if(ids.Count == 0) return new();
        try
        {
            var users = await _auth.GetUsersByIdsAsync(ids, ct);
            return users.ToDictionary(kv => kv.Key, kv => kv.Value.FullName);
        }
        catch { return new(); }   // sin nombres: no rompe el listado
    }

    private static FaceCheckDto ToDto(FaceCheckRow c, Dictionary<Guid, string> names) => new(
        c.Id, c.DriverId, c.DriverUserId, names.TryGetValue(c.DriverUserId, out var n) ? n : "Conductor",
        c.PhotoUrl, c.FaceReferencePhotoUrl,
        c.FaceStatus, c.FaceScore, c.FaceScore is { } sc ? FaceVerificationService.ToPercent(sc) : null,
        c.Liveness, c.FaceError, c.CheckedInAt, c.CheckedOutAt,
        c.FaceReviewStatus, c.FaceReviewNote, c.FaceReviewedByName, c.FaceReviewedAt);

    private async Task<IActionResult> Run(Func<Task<object>> action)
    {
        try { return Ok(await action()); }
        catch(ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch(KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }
}
