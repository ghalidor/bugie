using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

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

    public PresenceController(
        IDriverPresenceCheckInRepository checkIns,
        IDriverRepository drivers,
        IDriveStorageService storage)
    {
        _checkIns = checkIns;
        _drivers = drivers;
        _storage = storage;
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
    /// </summary>
    [HttpPost("checkin")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB hard cap defensivo
    public async Task<IActionResult> CheckIn(
        IFormFile file,
        [FromForm] decimal? faceQualityScore,
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

        // El conductor debe existir y estar aprobado para poder hacer check-in.
        // Aunque go-online ya valida esto, lo chequeamos acá también para no
        // gastar storage en conductores no aprobados (defensa en profundidad).
        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        // Defensa: si por algún motivo había un check-in activo (cliente que se
        // colgó sin avisar checkout, o doble check-in), lo cerramos primero.
        // Así nunca quedan dos activos para el mismo conductor.
        await _checkIns.CloseAllActiveAsync(CurrentUserId, ct);

        // Subimos la foto al storage. La guardamos junto a las otras fotos del
        // conductor (carpeta drivers/{id}/presence) para que sea fácil de auditar.
        await using var stream = file.OpenReadStream();
        var stored = await _storage.UploadAsync(
            stream,
            originalFileName: file.FileName,
            mimeType: file.ContentType,
            folderPath: $"drivers/{driver.Id}/presence",
            ct);

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
        };
        await _checkIns.CreateAsync(checkIn, ct);

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

    /// <summary>
    /// GET /api/drivers/me/presence/history?skip=0&take=20
    ///
    /// Historial paginado del conductor: cada vez que se conectó/desconectó.
    /// Pensado para que el conductor pueda ver su propio historial. Si
    /// queremos exponer al admin, va por otro endpoint /api/drivers/{id}/presence/history.
    /// </summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(
        [FromQuery] int skip = 0,
        [FromQuery] int take = 20,
        CancellationToken ct = default)
    {
        if(take > 100) take = 100;  // límite duro defensivo
        if(skip < 0) skip = 0;

        var rows = await _checkIns.GetHistoryAsync(CurrentUserId, skip, take, ct);
        return Ok(rows.Select(r => new
        {
            id = r.Id,
            photoUrl = r.PhotoUrl,
            checkedInAt = r.CheckedInAt,
            checkedOutAt = r.CheckedOutAt,
            durationMinutes = r.CheckedOutAt.HasValue
                ? (int)(r.CheckedOutAt.Value - r.CheckedInAt).TotalMinutes
                : (int?)null,
        }));
    }
}
