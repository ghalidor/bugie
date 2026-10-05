using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Endpoints relacionados al perfil del conductor (foto de perfil).
/// La foto de perfil es DIFERENTE de FaceIdPhotoUrl, que se usa para
/// la verificación facial diaria.
/// </summary>
[ApiController]
[Route("api/drivers/profile")]
[Authorize]
public class DriverProfileController : ControllerBase
{
    private readonly IDriverRepository _drivers;
    private readonly IDriveStorageService _storage;
    private readonly DriverDocumentsDeadlineService _deadline;

    public DriverProfileController(
        IDriverRepository drivers,
        IDriveStorageService storage,
        DriverDocumentsDeadlineService deadline)
    {
        _drivers = drivers;
        _storage = storage;
        _deadline = deadline;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// POST /api/drivers/profile/me/photo
    /// El conductor sube su foto de perfil.
    /// </summary>
    [HttpPost("me/photo")]
    public async Task<IActionResult> UploadMyProfilePhoto(IFormFile file, CancellationToken ct)
    {
        if(file is null || file.Length == 0)
            return BadRequest(new { error = "Archivo vacío." });

        var allowed = new[] { "image/jpeg", "image/jpg", "image/png", "image/webp" };
        if(!allowed.Contains(file.ContentType.ToLowerInvariant()))
            return BadRequest(new { error = "Solo se permiten imágenes JPG, PNG o WEBP." });

        if(file.Length > 5 * 1024 * 1024)
            return BadRequest(new { error = "La imagen no puede pesar más de 5 MB." });

        if(Bugie.Drivers.Api.Security.UploadCheck.Error(file) is { } fileError)
            return BadRequest(new { error = fileError });

        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        await using var stream = file.OpenReadStream();
        var stored = await _storage.UploadAsync(
            stream,
            originalFileName: file.FileName,
            mimeType: file.ContentType,
            folderPath: $"drivers/{driver.Id}/profile",
            ct);

        driver.SetProfilePhoto(stored.PreviewUrl);
        await _drivers.UpdateAsync(driver, ct);

        // La foto de perfil es un requisito: si era lo último que faltaba en
        // una aprobación por excepción, se cierra el plazo.
        try { await _deadline.CloseDeadlineIfCompleteAsync(driver, ct); }
        catch { /* el plazo se revisa también al aprobar documentos y en el job */ }

        return Ok(new { profilePhotoUrl = stored.PreviewUrl });
    }

    /// <summary>
    /// GET /api/drivers/profile/me
    /// Devuelve los datos básicos del conductor logueado incluyendo foto de perfil.
    /// </summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMyProfile(CancellationToken ct)
    {
        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if(driver is null) return NotFound();

        return Ok(new
        {
            id = driver.Id,
            userId = driver.UserId,
            status = (int)driver.Status,
            isOnline = driver.IsOnline,
            rating = driver.Rating,
            totalRatings = driver.TotalRatings,
            profilePhotoUrl = driver.ProfilePhotoUrl,
            faceIdPhotoUrl = driver.FaceIdPhotoUrl,
        });
    }
}