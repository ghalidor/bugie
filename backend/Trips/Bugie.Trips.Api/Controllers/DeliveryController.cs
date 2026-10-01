using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoints propios de ENVIOS (Delivery):
///  - Cliente sube fotos del paquete al solicitar.
///  - Conductor sube la verificacion al recoger (foto principal con el cliente
///    + secundarias + observacion). Esto habilita "Paquete a bordo" (Start).
///  - Listar fotos de un envio.
/// La creacion del envio en si va por POST /api/trips (ServiceType=Delivery).
/// </summary>
[ApiController]
[Route("api/trips")]
[Authorize]
public class DeliveryController : ControllerBase
{
    private readonly ITripRepository _trips;
    private readonly ITripPhotoRepository _photos;
    private readonly IFileStorageService _storage;

    public DeliveryController(ITripRepository trips, ITripPhotoRepository photos, IFileStorageService storage)
    {
        _trips = trips;
        _photos = photos;
        _storage = storage;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // ── Cliente: fotos del paquete al solicitar el envio ────────────────────
    [HttpPost("{tripId:guid}/package-photos")]
    public async Task<IActionResult> UploadPackagePhotos(
        Guid tripId, [FromForm] List<IFormFile> files, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Envio no encontrado." });
        if(trip.PassengerId != CurrentUserId) return Forbid();
        if(trip.ServiceType != ServiceType.Delivery)
            return BadRequest(new { error = "Este viaje no es un envio." });

        var saved = new List<object>();
        foreach(var f in files)
        {
            if(f.Length == 0) continue;
            await using var s = f.OpenReadStream();
            var stored = await _storage.UploadAsync(s, f.FileName, f.ContentType,
                $"trips/{tripId}/package", ct);
            var photo = TripPhoto.Create(tripId, stored.PublicUrl, TripPhotoKind.RequestPackage, CurrentUserId);
            await _photos.AddAsync(photo, ct);
            saved.Add(new { photo.Id, photo.Url });
        }
        return Ok(saved);
    }

    // ── Conductor: verificacion del paquete al recoger ──────────────────────
    // Requiere foto principal (paquete con el cliente). secondary y observation
    // son opcionales. Marca PickupVerified => habilita Start() del envio.
    [HttpPost("{tripId:guid}/pickup-verification")]
    public async Task<IActionResult> PickupVerification(
        Guid tripId,
        [FromForm] IFormFile? main,
        [FromForm] List<IFormFile>? secondary,
        [FromForm] string? observation,
        CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Envio no encontrado." });
        if(trip.DriverId != CurrentUserId) return Forbid();
        if(main is null || main.Length == 0)
            return BadRequest(new { error = "La foto principal del paquete es obligatoria." });

        try
        {
            await using(var s = main.OpenReadStream())
            {
                var stored = await _storage.UploadAsync(s, main.FileName, main.ContentType,
                    $"trips/{tripId}/pickup", ct);
                await _photos.AddAsync(
                    TripPhoto.Create(tripId, stored.PublicUrl, TripPhotoKind.PickupMain, CurrentUserId), ct);
            }

            foreach(var f in secondary ?? new List<IFormFile>())
            {
                if(f.Length == 0) continue;
                await using var s = f.OpenReadStream();
                var stored = await _storage.UploadAsync(s, f.FileName, f.ContentType,
                    $"trips/{tripId}/pickup", ct);
                await _photos.AddAsync(
                    TripPhoto.Create(tripId, stored.PublicUrl, TripPhotoKind.PickupSecondary, CurrentUserId), ct);
            }

            trip.SubmitPickupVerification(observation);
            await _trips.UpdateAsync(trip, ct);
            return Ok(new { verified = true });
        }
        catch(InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    // ── Listar fotos de un envio ────────────────────────────────────────────
    [HttpGet("{tripId:guid}/photos")]
    public async Task<IActionResult> GetPhotos(Guid tripId, CancellationToken ct)
    {
        var photos = await _photos.GetByTripAsync(tripId, ct);
        return Ok(photos.Select(p => new { p.Id, p.Url, Kind = (int)p.Kind, p.CreatedAt }));
    }
}
