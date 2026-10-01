using System.Security.Claims;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;
using Bugie.Drivers.Infrastructure.BackgroundServices;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Api.Controllers;

[ApiController]
[Route("api/drivers/documents")]
[Authorize]
public class DocumentsController : ControllerBase
{
    private readonly IDocumentRepository _docs;
    private readonly IDriverRepository _drivers;
    private readonly IDriveStorageService _storage;
    private readonly DocumentExpirationOptions _expirationOpt;
    private readonly ILogger<DocumentsController> _log;

    // Tipos de documento permitidos
    private static readonly HashSet<string> ValidTypes = new()
    {
        "dni_front", "dni_back", "license", "soat",
        "tarjeta_propiedad", "revision_tecnica", "certificado_unico_laboral",
    };

    // Documentos que requieren fecha de caducidad obligatoria
    private static readonly HashSet<string> RequiresExpiration = new()
    {
        "license", "soat", "revision_tecnica"
    };

    private const long MaxFileSizeBytes = 10 * 1024 * 1024;
    private static readonly string[] AllowedMimeTypes =
    {
        "image/jpeg", "image/png", "image/webp", "application/pdf",
    };

    public DocumentsController(
        IDocumentRepository docs,
        IDriverRepository drivers,
        IDriveStorageService storage,
        IOptions<DocumentExpirationOptions> expirationOpt,
        ILogger<DocumentsController> log)
    {
        _docs = docs;
        _drivers = drivers;
        _storage = storage;
        _expirationOpt = expirationOpt.Value;
        _log = log;
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/drivers/documents/me
    // Conductor ve sus documentos ACTIVOS (sin histórico)
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("me")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var userId = GetUserId();
        if(userId is null) return Unauthorized();

        var driver = await _drivers.GetByUserIdAsync(userId.Value, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        var docs = await _docs.GetActiveByDriverAsync(driver.Id, ct);
        return Ok(docs.Select(ToDto));
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/drivers/documents/by-driver/{driverId}
    // Admin ve documentos ACTIVOS de un conductor
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("by-driver/{driverId:guid}")]
    public async Task<IActionResult> GetByDriver(Guid driverId, CancellationToken ct)
    {
        var docs = await _docs.GetActiveByDriverAsync(driverId, ct);
        return Ok(docs.Select(ToDto));
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/drivers/documents/by-driver/{driverId}/history
    // Admin ve TODOS los documentos del conductor (incluye superseded)
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("by-driver/{driverId:guid}/history")]
    public async Task<IActionResult> GetHistory(Guid driverId, CancellationToken ct)
    {
        var docs = await _docs.GetByDriverAsync(driverId, ct);
        return Ok(docs.Select(ToDto));
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /api/drivers/documents
    // Subir / reemplazar documento. Si es licencia/soat/revision_tecnica
    // EXIGE fecha de caducidad. Si ya había uno aprobado, el viejo se marca
    // como superseded (histórico).
    // ─────────────────────────────────────────────────────────────────────
    [HttpPost]
    [RequestSizeLimit(MaxFileSizeBytes)]
    public async Task<IActionResult> Upload(
        [FromForm] string docType,
        [FromForm] IFormFile file,
        [FromForm] DateTime? expiresAt,
        CancellationToken ct)
    {
        var userId = GetUserId();
        if(userId is null) return Unauthorized();

        var driver = await _drivers.GetByUserIdAsync(userId.Value, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        // Validaciones básicas
        if(!ValidTypes.Contains(docType))
            return BadRequest(new { error = $"Tipo de documento inválido: {docType}" });

        if(file is null || file.Length == 0)
            return BadRequest(new { error = "Archivo vacío." });

        if(file.Length > MaxFileSizeBytes)
            return BadRequest(new { error = $"El archivo supera el límite de {MaxFileSizeBytes / 1024 / 1024} MB." });

        if(!AllowedMimeTypes.Contains(file.ContentType))
            return BadRequest(new { error = $"Tipo de archivo no permitido: {file.ContentType}" });

        // Fecha de caducidad obligatoria para licencia/soat/revision_tecnica
        if(RequiresExpiration.Contains(docType))
        {
            if(expiresAt is null)
                return BadRequest(new { error = "La fecha de caducidad es obligatoria para este documento." });

            if(expiresAt.Value.Date <= DateTime.UtcNow.Date)
                return BadRequest(new { error = "La fecha de caducidad debe ser futura." });
        }

        // Buscar documento ACTIVO existente (no superseded)
        var existing = await _docs.GetActiveByDriverAndTypeAsync(driver.Id, docType, ct);

        // Regla de ventana de renovación:
        // - Si existe un documento APROBADO con caducidad, solo se permite
        //   reemplazarlo dentro de los N días previos a la caducidad (configurable
        //   en appsettings: DocumentExpiration.RenewalWindowDays), o si ya caducó.
        // - Fuera de esa ventana NO PUEDE actualizar el documento.
        // - Si está pending/rejected, sí puede subir uno nuevo (caso normal).
        if(existing is not null && existing.Status == "approved")
        {
            var windowDays = _expirationOpt.RenewalWindowDays;
            var now = DateTime.UtcNow;

            if(existing.ExpiresAt.HasValue)
            {
                var expiresAtUtc = existing.ExpiresAt.Value;
                var isExpired = expiresAtUtc <= now;
                var daysUntilExpiry = (expiresAtUtc.Date - now.Date).TotalDays;
                var insideRenewalWindow = daysUntilExpiry <= windowDays;

                if(!isExpired && !insideRenewalWindow)
                {
                    return BadRequest(new
                    {
                        error = $"Este documento solo se puede actualizar desde {windowDays} días antes de su caducidad ({existing.ExpiresAt:dd/MM/yyyy}).",
                    });
                }
            }
            else
            {
                // Documento aprobado sin fecha de caducidad (ej. DNI) — no se renueva
                return BadRequest(new { error = "Este documento ya fue aprobado y no requiere actualización." });
            }
        }

        try
        {
            using var stream = file.OpenReadStream();
            var stored = await _storage.UploadAsync(
                stream, file.FileName, file.ContentType,
                folderPath: $"drivers/{driver.Id}",
                ct);

            // Si había uno (aprobado vencido, rechazado o pending), marcarlo como histórico
            if(existing is not null)
            {
                existing.Supersede();
                await _docs.UpdateAsync(existing, ct);
            }

            // Crear el nuevo registro
            var doc = DriverDocument.Create(
                driver.Id, docType, stored.PreviewUrl,
                stored.DriveFileId, stored.OriginalFileName, stored.MimeType, stored.SizeBytes,
                expiresAt);
            await _docs.AddAsync(doc, ct);

            // Estado del conductor según escenario de subida:
            //
            // - ExpiredDocs (6) → UnderReview (2): caso clásico, ya caducó algún
            //   doc y el conductor está suspendido hasta renovar.
            //
            // - Approved (3) → UnderReview (2): renovación ADELANTADA. El conductor
            //   sube un doc para reemplazar otro que aún no caducó (dentro de la
            //   ventana). Hasta que admin apruebe el nuevo doc, vuelve a "en
            //   revisión" para que aparezca en el panel de verificación del admin.
            //
            // - Otros estados (PendingDocs, UnderReview, Suspended, Rejected) no
            //   se tocan: el flujo natural ya los maneja.
            var st = driver.Status;
            if(st == Bugie.Drivers.Domain.Enums.DriverStatus.ExpiredDocs ||
               st == Bugie.Drivers.Domain.Enums.DriverStatus.Approved)
            {
                driver.BackToReview();
                await _drivers.UpdateAsync(driver, ct);
            }

            return Ok(ToDto(doc));
        }
        catch(Exception ex)
        {
            _log.LogError(ex, "Error subiendo documento {DocType} del driver {DriverId}", docType, driver.Id);
            return StatusCode(500, new { error = "Error al subir el archivo. Intenta de nuevo." });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/drivers/documents/{id}/download
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id, CancellationToken ct)
    {
        var doc = await _docs.GetByIdAsync(id, ct);
        if(doc is null || string.IsNullOrWhiteSpace(doc.DriveFileId))
            return NotFound();

        var stream = await _storage.DownloadAsync(doc.DriveFileId, ct);
        return File(stream, doc.MimeType ?? "application/octet-stream", doc.OriginalFileName);
    }

    // ─────────────────────────────────────────────────────────────────────
    // PUT /api/drivers/documents/{id}/approve
    // ─────────────────────────────────────────────────────────────────────
    [HttpPut("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        var adminId = GetUserId();
        if(adminId is null) return Unauthorized();

        var doc = await _docs.GetByIdAsync(id, ct);
        if(doc is null) return NotFound();

        doc.Approve(adminId.Value);
        await _docs.UpdateAsync(doc, ct);
        return Ok(ToDto(doc));
    }

    // ─────────────────────────────────────────────────────────────────────
    // PUT /api/drivers/documents/{id}/reject
    // ─────────────────────────────────────────────────────────────────────
    public record DocumentRejectRequest(string? Reason);

    [HttpPut("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] DocumentRejectRequest body, CancellationToken ct)
    {
        var adminId = GetUserId();
        if(adminId is null) return Unauthorized();

        var doc = await _docs.GetByIdAsync(id, ct);
        if(doc is null) return NotFound();

        doc.Reject(adminId.Value, body.Reason);
        await _docs.UpdateAsync(doc, ct);
        return Ok(ToDto(doc));
    }

    // ─────────────────────────────────────────────────────────────────────
    // DELETE /api/drivers/documents/{id}
    // ─────────────────────────────────────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var doc = await _docs.GetByIdAsync(id, ct);
        if(doc is null) return NotFound();

        if(!string.IsNullOrWhiteSpace(doc.DriveFileId))
        {
            try { await _storage.DeleteAsync(doc.DriveFileId, ct); }
            catch(Exception ex) { _log.LogWarning(ex, "No se pudo borrar archivo {Id}", doc.DriveFileId); }
        }

        await _docs.DeleteAsync(id, ct);
        return NoContent();
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/drivers/documents/me/can-upload/{docType}
    // El Flutter consulta este endpoint antes de mostrar el botón "Subir"
    // de cada documento. Devuelve:
    //   { canUpload: bool, reason: string, daysUntilExpiry: int? }
    //
    // Reglas (mismas que el POST, anticipadas para mejor UX):
    //   - Si no hay doc o está pending/rejected → canUpload = true
    //   - Si está aprobado y ya caducó → canUpload = true (renovación)
    //   - Si está aprobado y caduca en ≤ RenewalWindowDays → canUpload = true
    //   - En cualquier otro caso → canUpload = false con explicación
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("me/can-upload/{docType}")]
    public async Task<IActionResult> CanUpload(string docType, CancellationToken ct)
    {
        var userId = GetUserId();
        if(userId is null) return Unauthorized();

        if(!ValidTypes.Contains(docType))
            return BadRequest(new { error = $"Tipo de documento inválido: {docType}" });

        var driver = await _drivers.GetByUserIdAsync(userId.Value, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        var existing = await _docs.GetActiveByDriverAndTypeAsync(driver.Id, docType, ct);
        var windowDays = _expirationOpt.RenewalWindowDays;

        // No hay documento — puede subirlo
        if(existing is null)
        {
            return Ok(new { canUpload = true, reason = (string?)null, daysUntilExpiry = (int?)null });
        }

        // Documentos pending o rejected: puede sobrescribir
        if(existing.Status == "pending" || existing.Status == "rejected")
        {
            return Ok(new { canUpload = true, reason = (string?)null, daysUntilExpiry = (int?)null });
        }

        // Documentos aprobados: aplicar regla de ventana
        if(existing.Status == "approved")
        {
            if(!existing.ExpiresAt.HasValue)
            {
                // Sin fecha de caducidad (ej. DNI) — no se renueva
                return Ok(new
                {
                    canUpload = false,
                    reason = "Este documento no requiere actualización.",
                    daysUntilExpiry = (int?)null,
                });
            }

            var now = DateTime.UtcNow;
            var daysUntilExpiry = (int)Math.Floor((existing.ExpiresAt.Value.Date - now.Date).TotalDays);
            var isExpired = daysUntilExpiry < 0;
            var insideWindow = daysUntilExpiry <= windowDays;

            if(isExpired || insideWindow)
            {
                return Ok(new { canUpload = true, reason = (string?)null, daysUntilExpiry });
            }

            return Ok(new
            {
                canUpload = false,
                reason = $"Solo puedes actualizar este documento desde {windowDays} días antes de su caducidad.",
                daysUntilExpiry,
            });
        }

        // status desconocido: por seguridad bloqueamos
        return Ok(new
        {
            canUpload = false,
            reason = "No se puede actualizar este documento en este momento.",
            daysUntilExpiry = (int?)null,
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    private Guid? GetUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                 ?? User.FindFirstValue("sub")
                 ?? User.FindFirstValue("userId");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private static object ToDto(DriverDocument d) => new
    {
        id = d.Id,
        driverId = d.DriverId,
        docType = d.DocType,
        fileUrl = d.FileUrl,
        driveFileId = d.DriveFileId,
        originalFileName = d.OriginalFileName,
        mimeType = d.MimeType,
        sizeBytes = d.SizeBytes,
        status = d.Status,
        rejectionReason = d.RejectionReason,
        expiresAt = d.ExpiresAt,
        reviewedAt = d.ReviewedAt,
        reviewedBy = d.ReviewedBy,
        createdAt = d.CreatedAt,
    };
}