using System.Security.Claims;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Auth.Api.Controllers;

/// <summary>
/// Foto de perfil del usuario actual (cualquier rol).
/// Endpoints:
///   - POST /api/auth/me/profile-photo  (multipart "file")
///
/// El archivo se guarda en /uploads/profiles/{userId}/...
/// y la URL relativa se persiste en auth.Users.ProfilePhotoUrl.
/// El cliente debe usar ApiConfig.resolveMediaUrl() para mostrarla, porque
/// se devuelve relativa para evitar el problema de host/IP entre dispositivos.
/// </summary>
[ApiController]
[Route("api/auth/me")]
[Authorize]
public class ProfileController : ControllerBase
{
    private const long MaxFileSizeBytes = 5 * 1024 * 1024; // 5 MB
    private static readonly string[] AllowedMime = new[] {
        "image/jpeg", "image/jpg", "image/png", "image/webp"
    };

    private readonly IUserRepository _users;
    private readonly IFileStorageService _storage;
    private readonly ILogger<ProfileController> _log;

    public ProfileController(
        IUserRepository users,
        IFileStorageService storage,
        ILogger<ProfileController> log)
    {
        _users = users;
        _storage = storage;
        _log = log;
    }

    [HttpPost("profile-photo")]
    [RequestSizeLimit(MaxFileSizeBytes)]
    public async Task<IActionResult> UploadPhoto(IFormFile file, CancellationToken ct)
    {
        var userId = GetUserId();
        if(userId is null) return Unauthorized();
        if(file is null || file.Length == 0)
            return BadRequest(new { error = "Archivo vacío o no enviado." });
        if(file.Length > MaxFileSizeBytes)
            return BadRequest(new { error = "Archivo demasiado grande (máx 5 MB)." });
        if(!AllowedMime.Contains(file.ContentType?.ToLowerInvariant()))
            return BadRequest(new { error = "Formato no permitido. Usa JPG, PNG o WEBP." });

        // Carpeta: profiles/{userId}/
        var folder = $"profiles/{userId}";
        await using var stream = file.OpenReadStream();
        var stored = await _storage.UploadAsync(
            stream, file.FileName, file.ContentType ?? "image/jpeg", folder, ct);

        await _users.UpdateProfilePhotoAsync(userId.Value, stored.PublicUrl, ct);

        _log.LogInformation("Foto de perfil actualizada: user {UserId}", userId);
        return Ok(new { profilePhotoUrl = stored.PublicUrl });
    }

    private Guid? GetUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }
}
