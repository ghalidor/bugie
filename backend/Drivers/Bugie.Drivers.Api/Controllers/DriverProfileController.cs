using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Drivers.Application.Services;
using Bugie.Drivers.Domain.Entities;
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
    private readonly IDriverFaceRepository _faces;
    private readonly FaceVerificationService _face;

    public DriverProfileController(
        IDriverRepository drivers,
        IDriverFaceRepository faces,
        FaceVerificationService face)
    {
        _drivers = drivers;
        _faces = faces;
        _face = face;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// POST /api/drivers/profile/me/photo
    /// El conductor sube su foto de perfil.
    ///
    /// Respuesta: { photoUrl, status, message, attemptsLeftToday } (+ profilePhotoUrl,
    /// igual a photoUrl, por compatibilidad con versiones anteriores de la app).
    ///  - Verificación facial apagada: la foto se aplica directo (status "approved").
    ///  - Encendida: si coincide con su foto aprobada se aplica sola ("approved");
    ///    si no coincide o es la primera queda "pending_review" y photoUrl sigue
    ///    siendo la foto aprobada vigente (puede ser null). Máximo
    ///    profile_photo_daily_limit por día de Perú: al pasarse, 429 { error }.
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

        byte[] bytes;
        await using(var input = file.OpenReadStream())
        using(var buffer = new MemoryStream())
        {
            await input.CopyToAsync(buffer, ct);
            bytes = buffer.ToArray();
        }

        var r = await _face.UploadProfilePhotoAsync(driver, bytes, file.FileName, file.ContentType, ct);
        if(r.LimitError is not null)
            return StatusCode(StatusCodes.Status429TooManyRequests, new { error = r.LimitError });

        return Ok(new
        {
            photoUrl = r.PhotoUrl,
            status = r.Status,
            message = r.Message,
            attemptsLeftToday = r.AttemptsLeftToday,
            profilePhotoUrl = r.PhotoUrl,
        });
    }

    /// <summary>
    /// GET /api/drivers/profile/me
    /// Devuelve los datos básicos del conductor logueado incluyendo foto de perfil.
    /// pendingPhotoUrl / pendingPhotoStatus ("pending_review" | "rejected" | null) /
    /// pendingPhotoReason: su última foto subida si está en revisión o fue rechazada.
    /// </summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMyProfile(CancellationToken ct)
    {
        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if(driver is null) return NotFound();

        var last = await _faces.GetLatestAttemptAsync(driver.Id, ct);
        var pending = last is { Status: FaceCheck.PhotoPendingReview or FaceCheck.PhotoRejected } ? last : null;

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
            pendingPhotoUrl = pending?.PhotoUrl,
            pendingPhotoStatus = pending?.Status,
            pendingPhotoReason = pending?.Status == FaceCheck.PhotoRejected ? pending.Reason : null,
        });
    }
}