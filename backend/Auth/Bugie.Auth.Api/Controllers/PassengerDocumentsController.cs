using System.Security.Claims;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Auth.Api.Controllers;

public record PassengerDocRejectRequest(string? Reason);

[ApiController]
[Route("api/auth/passengers/documents")]
[Authorize]
public class PassengerDocumentsController : ControllerBase {
    private readonly IPassengerDocumentRepository _docs;
    private readonly IUserRepository _users;
    private readonly IFileStorageService _storage;
    private readonly ILogger<PassengerDocumentsController> _log;

    private static readonly HashSet<string> ValidTypes = new() { "dni_front", "dni_back" };
    private const long MaxFileSizeBytes = 10 * 1024 * 1024;
    private static readonly string[] AllowedMimeTypes =
    {
        "image/jpeg", "image/png", "image/webp", "application/pdf"
    };

    public PassengerDocumentsController(
        IPassengerDocumentRepository docs,
        IUserRepository users,
        IFileStorageService storage,
        ILogger<PassengerDocumentsController> log) {
        _docs = docs;
        _users = users;
        _storage = storage;
        _log = log;
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/auth/passengers/documents/me
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("me")]
    public async Task<IActionResult> GetMine(CancellationToken ct) {
        var userId = GetUserId();
        if(userId is null) return Unauthorized();

        var docs = await _docs.GetByUserAsync(userId.Value, ct);
        return Ok(docs.Select(ToDto));
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/auth/passengers/documents/by-user/{userId}  (admin)
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("by-user/{userId:guid}")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetByUser(Guid userId, CancellationToken ct) {
        var docs = await _docs.GetByUserAsync(userId, ct);
        return Ok(docs.Select(ToDto));
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /api/auth/passengers/documents  (multipart)
    // ─────────────────────────────────────────────────────────────────────
    [HttpPost]
    [RequestSizeLimit(MaxFileSizeBytes)]
    public async Task<IActionResult> Upload(
        [FromForm] string docType,
        [FromForm] IFormFile file,
        CancellationToken ct) {
        var userId = GetUserId();
        if(userId is null) return Unauthorized();

        if(!ValidTypes.Contains(docType))
            return BadRequest(new { error = $"Tipo de documento inválido: {docType}" });

        if(file is null || file.Length == 0)
            return BadRequest(new { error = "Archivo vacío." });

        if(file.Length > MaxFileSizeBytes)
            return BadRequest(new { error = $"El archivo supera el límite de {MaxFileSizeBytes / 1024 / 1024} MB." });

        if(!AllowedMimeTypes.Contains(file.ContentType))
            return BadRequest(new { error = $"Tipo de archivo no permitido: {file.ContentType}" });

        var existing = await _docs.GetByUserAndTypeAsync(userId.Value, docType, ct);

        try {
            using var stream = file.OpenReadStream();
            var stored = await _storage.UploadAsync(
                stream, file.FileName, file.ContentType,
                folderPath: $"passengers/{userId.Value}",
                ct);

            if(existing is not null) {
                if(!string.IsNullOrWhiteSpace(existing.StorageFileId)) {
                    try { await _storage.DeleteAsync(existing.StorageFileId, ct); } catch(Exception ex) { _log.LogWarning(ex, "No se pudo borrar archivo anterior"); }
                }
                existing.UpdateFile(stored.PublicUrl, stored.StorageFileId,
                                    stored.OriginalFileName, stored.MimeType, stored.SizeBytes);
                await _docs.UpdateAsync(existing, ct);
                return Ok(ToDto(existing));
            }

            var doc = PassengerDocument.Create(
                userId.Value, docType, stored.PublicUrl,
                stored.StorageFileId, stored.OriginalFileName, stored.MimeType, stored.SizeBytes);
            await _docs.AddAsync(doc, ct);
            return Ok(ToDto(doc));
        } catch(Exception ex) {
            _log.LogError(ex, "Error subiendo documento de pasajero");
            return StatusCode(500, new { error = "Error al subir el archivo." });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/auth/passengers/documents/{id}/download
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("{id:guid}/download")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Download(Guid id, CancellationToken ct) {
        var doc = await _docs.GetByIdAsync(id, ct);
        if(doc is null || string.IsNullOrWhiteSpace(doc.StorageFileId))
            return NotFound();

        var stream = await _storage.DownloadAsync(doc.StorageFileId, ct);
        return File(stream, doc.MimeType ?? "application/octet-stream", doc.OriginalFileName);
    }

    // ─────────────────────────────────────────────────────────────────────
    // PUT /api/auth/passengers/documents/{id}/approve
    // ─────────────────────────────────────────────────────────────────────
    [HttpPut("{id:guid}/approve")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct) {
        var adminId = GetUserId();
        if(adminId is null) return Unauthorized();

        var doc = await _docs.GetByIdAsync(id, ct);
        if(doc is null) return NotFound();

        doc.Approve(adminId.Value);
        await _docs.UpdateAsync(doc, ct);
        return Ok(ToDto(doc));
    }

    // ─────────────────────────────────────────────────────────────────────
    // PUT /api/auth/passengers/documents/{id}/reject
    // ─────────────────────────────────────────────────────────────────────
    [HttpPut("{id:guid}/reject")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] PassengerDocRejectRequest body, CancellationToken ct) {
        var adminId = GetUserId();
        if(adminId is null) return Unauthorized();

        var doc = await _docs.GetByIdAsync(id, ct);
        if(doc is null) return NotFound();

        doc.Reject(adminId.Value, body.Reason);
        await _docs.UpdateAsync(doc, ct);
        return Ok(ToDto(doc));
    }

    // ─────────────────────────────────────────────────────────────────────
    private Guid? GetUserId() {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                 ?? User.FindFirstValue("sub")
                 ?? User.FindFirstValue("userId");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private static object ToDto(PassengerDocument d) => new {
        id = d.Id,
        userId = d.UserId,
        docType = d.DocType,
        fileUrl = d.FileUrl,
        storageFileId = d.StorageFileId,
        originalFileName = d.OriginalFileName,
        mimeType = d.MimeType,
        sizeBytes = d.SizeBytes,
        status = d.Status,
        rejectionReason = d.RejectionReason,
        reviewedAt = d.ReviewedAt,
        createdAt = d.CreatedAt,
    };
}