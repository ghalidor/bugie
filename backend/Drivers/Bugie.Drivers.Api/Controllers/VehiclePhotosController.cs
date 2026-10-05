using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Domain.Entities;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Fotos del vehiculo: frente, costado y placa (tabla drivers.vehiclephotos).
/// Las tres son obligatorias al registrar el vehiculo y se pueden reemplazar despues.
/// La foto de frente tambien se guarda en drivers.vehicles.photourl
/// (compatibilidad con las pantallas que ya la usan).
/// </summary>
[ApiController]
[Route("api/drivers/vehicles")]
[Authorize]
public class VehiclePhotosController : ControllerBase
{
    private const long MaxBytes = 5 * 1024 * 1024;
    private static readonly string[] AllowedTypes = { "image/jpeg", "image/jpg", "image/png", "image/webp" };

    private readonly IVehicleRepository _vehicles;
    private readonly IVehiclePhotoRepository _photos;
    private readonly IDriverRepository _drivers;
    private readonly IDriveStorageService _storage;
    private readonly IMediator _mediator;

    public VehiclePhotosController(
        IVehicleRepository vehicles,
        IVehiclePhotoRepository photos,
        IDriverRepository drivers,
        IDriveStorageService storage,
        IMediator mediator)
    {
        _vehicles = vehicles;
        _photos = photos;
        _drivers = drivers;
        _storage = storage;
        _mediator = mediator;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record VehiclePhotoDto(string Type, string Url, DateTime UpdatedAt);

    /// <summary>Formulario de alta: datos del vehiculo + las tres fotos.</summary>
    public class AddVehicleWithPhotosForm
    {
        public string Plate { get; set; } = string.Empty;
        public string Brand { get; set; } = string.Empty;
        public string Model { get; set; } = string.Empty;
        public short Year { get; set; }
        public string Color { get; set; } = string.Empty;
        public IFormFile? PhotoFront { get; set; }
        public IFormFile? PhotoSide { get; set; }
        public IFormFile? PhotoPlate { get; set; }
    }

    /// <summary>
    /// POST /api/drivers/vehicles/with-photos (multipart/form-data)
    /// Registra un vehiculo nuevo con sus tres fotos. Queda como vehiculo activo.
    /// </summary>
    [HttpPost("with-photos")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<IActionResult> AddWithPhotos([FromForm] AddVehicleWithPhotosForm form, CancellationToken ct)
    {
        if(string.IsNullOrWhiteSpace(form.Plate) || string.IsNullOrWhiteSpace(form.Brand) ||
           string.IsNullOrWhiteSpace(form.Model) || string.IsNullOrWhiteSpace(form.Color) || form.Year <= 0)
            return BadRequest(new { error = "Completa todos los datos del vehículo." });

        var files = new Dictionary<string, IFormFile?>
        {
            [VehiclePhoto.Front] = form.PhotoFront,
            [VehiclePhoto.Side]  = form.PhotoSide,
            [VehiclePhoto.Plate] = form.PhotoPlate,
        };
        foreach(var (type, file) in files)
        {
            var error = ValidateFile(file, Label(type));
            if(error is not null) return BadRequest(new { error });
        }

        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        Application.DTOs.VehicleDto created;
        try
        {
            created = await _mediator.Send(new AddVehicleCommand(
                driver.Id, form.Plate, form.Brand, form.Model, form.Year, form.Color), ct);
        }
        catch(Exception ex) when(ex.Message.Contains("uq_vehicle_plate") || ex.Message.Contains("23505"))
        {
            return Conflict(new { error = "Esa placa ya está registrada." });
        }

        var vehicle = await _vehicles.GetByIdAsync(created.Id, ct);
        if(vehicle is null) return NotFound(new { error = "Vehículo no encontrado." });

        foreach(var (type, file) in files)
            await SavePhotoAsync(vehicle, driver.Id, type, file!, ct);

        return Ok(new
        {
            id = vehicle.Id,
            plate = vehicle.Plate,
            photoUrl = vehicle.PhotoUrl,
            photos = await ListAsync(vehicle.Id, ct),
        });
    }

    /// <summary>
    /// GET /api/drivers/vehicles/{vehicleId}/photos
    /// Fotos del vehiculo. Lo ve su conductor o un admin.
    /// </summary>
    [HttpGet("{vehicleId:guid}/photos")]
    [RequirePermission(Perm.ViewDrivers, Perm.ViewVerification, SkipForNonAdmins = true)]
    public async Task<IActionResult> GetPhotos(Guid vehicleId, CancellationToken ct)
    {
        var vehicle = await _vehicles.GetByIdAsync(vehicleId, ct);
        if(vehicle is null) return NotFound(new { error = "Vehículo no encontrado." });

        if(!User.IsInRole("admin"))
        {
            var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
            if(driver is null || driver.Id != vehicle.DriverId)
                return NotFound(new { error = "Vehículo no encontrado." });
        }

        return Ok(await ListAsync(vehicleId, ct));
    }

    /// <summary>
    /// POST /api/drivers/vehicles/{vehicleId}/photos/{type}  (type = front | side | plate)
    /// El conductor sube o reemplaza una foto de su vehiculo.
    /// </summary>
    [HttpPost("{vehicleId:guid}/photos/{type}")]
    public async Task<IActionResult> UploadPhoto(Guid vehicleId, string type, IFormFile? file, CancellationToken ct)
    {
        type = (type ?? string.Empty).Trim().ToLowerInvariant();
        if(!VehiclePhoto.IsValidType(type))
            return BadRequest(new { error = "Tipo de foto inválido. Usa front, side o plate." });

        var error = ValidateFile(file, Label(type));
        if(error is not null) return BadRequest(new { error });

        var driver = await _drivers.GetByUserIdAsync(CurrentUserId, ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        var vehicle = await _vehicles.GetByIdAsync(vehicleId, ct);
        if(vehicle is null || vehicle.DriverId != driver.Id)
            return NotFound(new { error = "Vehículo no encontrado." });

        var url = await SavePhotoAsync(vehicle, driver.Id, type, file!, ct);
        return Ok(new { type, url });
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private async Task<string> SavePhotoAsync(Vehicle vehicle, Guid driverId, string type, IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        var stored = await _storage.UploadAsync(
            stream,
            originalFileName: $"{type}_{file.FileName}",
            mimeType: file.ContentType,
            folderPath: $"vehicles/{driverId}",
            ct);

        await _photos.UpsertAsync(vehicle.Id, type, stored.PreviewUrl, ct);

        // La de frente tambien es la "foto del vehiculo" de siempre.
        if(type == VehiclePhoto.Front)
        {
            vehicle.SetPhoto(stored.PreviewUrl);
            await _vehicles.UpdateAsync(vehicle, ct);
        }
        return stored.PreviewUrl;
    }

    private async Task<List<VehiclePhotoDto>> ListAsync(Guid vehicleId, CancellationToken ct) =>
        (await _photos.GetByVehicleAsync(vehicleId, ct))
            .Select(p => new VehiclePhotoDto(p.PhotoType, p.Url, p.UpdatedAt))
            .ToList();

    private static string? ValidateFile(IFormFile? file, string label)
    {
        if(file is null || file.Length == 0)
            return $"Falta la foto: {label}.";
        if(!AllowedTypes.Contains(file.ContentType.ToLowerInvariant()))
            return $"La foto {label} debe ser JPG, PNG o WEBP.";
        if(file.Length > MaxBytes)
            return $"La foto {label} no puede pesar más de 5 MB.";
        if(Bugie.Drivers.Api.Security.UploadCheck.Error(file) is not null)
            return $"La foto {label} debe ser una imagen JPG, PNG o WEBP válida.";
        return null;
    }

    private static string Label(string type) => type switch
    {
        VehiclePhoto.Front => "frente",
        VehiclePhoto.Side  => "costado",
        VehiclePhoto.Plate => "placa",
        _ => type,
    };
}
