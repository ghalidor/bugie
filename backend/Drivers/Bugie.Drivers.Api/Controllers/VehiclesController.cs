using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Endpoints relacionados al vehículo del conductor: subir foto del auto.
/// </summary>
[ApiController]
[Route("api/drivers/vehicles")]
[Authorize]
public class VehiclesController : ControllerBase
{
    private readonly IVehicleRepository _vehicles;
    private readonly IDriverRepository _drivers;
    private readonly IDriveStorageService _storage;
    private readonly IVehiclePhotoRepository _photos;

    public VehiclesController(
        IVehicleRepository vehicles,
        IDriverRepository drivers,
        IDriveStorageService storage,
        IVehiclePhotoRepository photos)
    {
        _vehicles = vehicles;
        _drivers = drivers;
        _storage = storage;
        _photos = photos;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// POST /api/drivers/vehicles/me/photo
    /// El conductor sube la foto de su vehículo activo.
    /// </summary>
    [HttpPost("me/photo")]
    public async Task<IActionResult> UploadMyVehiclePhoto(IFormFile file, CancellationToken ct)
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

        var vehicle = await _vehicles.GetActiveByDriverAsync(driver.Id, ct);
        if(vehicle is null) return BadRequest(new { error = "No tienes un vehículo activo." });

        // Si ya tenía foto, borrarla (no rompe si falla)
        if(!string.IsNullOrWhiteSpace(vehicle.PhotoUrl))
        {
            // No tenemos guardado el DriveFileId de la foto del vehículo (sólo URL),
            // así que no podemos borrar la antigua aquí. Eso lo dejamos para una
            // mejora futura si se vuelve necesario.
        }

        await using var stream = file.OpenReadStream();
        var stored = await _storage.UploadAsync(
            stream,
            originalFileName: file.FileName,
            mimeType: file.ContentType,
            folderPath: $"vehicles/{driver.Id}",
            ct);

        vehicle.SetPhoto(stored.PreviewUrl);
        await _vehicles.UpdateAsync(vehicle, ct);
        // Esta foto es la de FRENTE (ver VehiclePhotosController).
        await _photos.UpsertAsync(vehicle.Id, "front", stored.PreviewUrl, ct);

        return Ok(new { photoUrl = stored.PreviewUrl });
    }

    /// <summary>
    /// GET /api/drivers/vehicles/me
    /// Devuelve el vehículo activo del conductor logueado.
    /// </summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMyVehicle(CancellationToken ct)
    {
        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if(driver is null) return NotFound();

        var vehicle = await _vehicles.GetActiveByDriverAsync(driver.Id, ct);
        if(vehicle is null) return NotFound();

        return Ok(new
        {
            id = vehicle.Id,
            driverId = vehicle.DriverId,
            plate = vehicle.Plate,
            brand = vehicle.Brand,
            model = vehicle.Model,
            year = vehicle.Year,
            color = vehicle.Color,
            photoUrl = vehicle.PhotoUrl,
            // es el vehiculo activo (la app muestra la insignia "Activo")
            isActive = vehicle.IsActive,
        });
    }
}