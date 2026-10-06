using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
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
    private readonly ITripNotificationService _notify;
    // Tiempo real a pasajero y conductor (hub /hubs/trips). Fire-and-forget, nunca lanza.
    private readonly ITripRealtimeNotifier _realtime;

    public DeliveryController(ITripRepository trips, ITripPhotoRepository photos, IFileStorageService storage,
        ITripNotificationService notify, ITripRealtimeNotifier realtime)
    {
        _trips = trips;
        _photos = photos;
        _storage = storage;
        _notify = notify;
        _realtime = realtime;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // Limites de las fotos de envios
    private const long MaxPhotoBytes      = 8 * 1024 * 1024; // 8 MB por foto
    private const int  MaxPackagePhotos   = 5;               // fotos del paquete (cliente)
    private const int  MaxSecondaryPhotos = 4;               // fotos extra al recoger
    private static readonly string[] AllowedExtensions = { ".jpg", ".jpeg", ".png", ".webp", ".heic" };

    /// Devuelve un mensaje de error si el archivo no es una imagen valida, o null si esta bien.
    private static string? ValidatePhoto(IFormFile f)
    {
        if(f.Length == 0) return "La foto está vacía.";
        if(f.Length > MaxPhotoBytes) return "Cada foto puede pesar como máximo 8 MB.";
        var ext = Path.GetExtension(f.FileName ?? "").ToLowerInvariant();
        var isImage = (f.ContentType ?? "").StartsWith("image/", StringComparison.OrdinalIgnoreCase);
        if(!isImage && !AllowedExtensions.Contains(ext))
            return "Solo se aceptan fotos (JPG, PNG, WEBP o HEIC).";
        // Tipo real por magic bytes (no basta el nombre ni el Content-Type).
        return Bugie.Trips.Api.Security.UploadCheck.Error(f, allowHeic: true);
    }

    // ── Cliente: solicitar un envio (datos + fotos en una sola peticion) ────
    // Form: "data" = JSON de CreateTripRequest, "files" = 1 a 5 fotos del paquete.
    // Sin fotos validas no se crea nada. El envio se crea sin avisar a los
    // conductores; recien cuando las fotos estan guardadas se les avisa.
    // Si guardar las fotos falla, el envio se cancela (nadie lo ve sin fotos).
    [HttpPost("delivery")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> CreateDelivery(
        [FromForm] string? data,
        [FromForm] List<IFormFile>? files,
        [FromServices] MediatR.IMediator mediator,
        [FromServices] FluentValidation.IValidator<Bugie.Trips.Application.Commands.CreateTripCommand> validator,
        CancellationToken ct)
    {
        // 1. Datos del envio
        Bugie.Trips.Application.DTOs.CreateTripRequest? req = null;
        try
        {
            if(!string.IsNullOrWhiteSpace(data))
                req = System.Text.Json.JsonSerializer.Deserialize<Bugie.Trips.Application.DTOs.CreateTripRequest>(
                    data, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch(System.Text.Json.JsonException) { /* se responde abajo */ }
        if(req is null) return BadRequest(new { error = "Faltan los datos del envío." });

        // 2. Fotos del paquete: obligatorias (1 a 5)
        var photos = (files ?? new List<IFormFile>()).Where(f => f.Length > 0).ToList();
        if(photos.Count == 0)
            return BadRequest(new { error = "Sube al menos una foto del paquete." });
        if(photos.Count > MaxPackagePhotos)
            return BadRequest(new { error = $"Máximo {MaxPackagePhotos} fotos del paquete." });
        foreach(var f in photos)
        {
            var err = ValidatePhoto(f);
            if(err is not null) return BadRequest(new { error = err });
        }

        // 3. Validar y crear el envio (sin avisar todavia a los conductores)
        var cmd = new Bugie.Trips.Application.Commands.CreateTripCommand(
            CurrentUserId,
            req.OriginAddress, req.OriginLat, req.OriginLng,
            req.DestAddress, req.DestLat, req.DestLng,
            req.EstimatedFare, req.PaymentMethod, req.Waypoints,
            ServiceType.Delivery, req.PackageDescription, req.PackageWeightKg,
            req.PackageIsFragile, req.PackageDetails,
            req.RecipientName, req.RecipientPhone,
            NotifyDrivers: false,
            // Programado (sin zona = hora de Peru); null = ahora.
            ScheduledAt: req.ScheduledAt is null ? null
                : Bugie.Trips.Domain.Common.BugieTime.ToUtcFromInput(req.ScheduledAt.Value));
        var validation = await validator.ValidateAsync(cmd, ct);
        if(!validation.IsValid)
            return BadRequest(new { error = validation.Errors[0].ErrorMessage });

        Bugie.Trips.Application.DTOs.TripDto dto;
        try
        {
            dto = await mediator.Send(cmd, ct);
        }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
        catch(KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }

        // 4. Guardar las fotos. Si falla, se cancela el envio.
        try
        {
            foreach(var f in photos)
            {
                await using var s = f.OpenReadStream();
                var stored = await _storage.UploadAsync(s, f.FileName, f.ContentType,
                    $"trips/{dto.Id}/package", ct);
                await _photos.AddAsync(
                    TripPhoto.Create(dto.Id, stored.PublicUrl, TripPhotoKind.RequestPackage, CurrentUserId), ct);
            }
        }
        catch(Exception ex)
        {
            Console.WriteLine($"[Envio] No se pudieron guardar las fotos de {dto.Id}: {ex.Message}");
            var trip = await _trips.GetByIdAsync(dto.Id, CancellationToken.None);
            if(trip is not null)
            {
                trip.Cancel("system", "No se pudieron guardar las fotos del paquete.");
                await _trips.UpdateAsync(trip, CancellationToken.None);
                _ = _realtime.TripChangedAsync(trip, RealtimeReasons.Cancelled);
            }
            return StatusCode(500, new { error = "No se pudieron guardar las fotos del paquete. Intenta de nuevo." });
        }

        // 5. Recien ahora los conductores cercanos ven y reciben el envio.
        await mediator.Send(new Bugie.Trips.Application.Commands.NotifyNearbyDriversCommand(dto.Id), ct);
        // Tiempo real: otras pantallas del cliente y la lista de solicitudes de los conductores
        // (recien ahora el envio es visible, porque ya tiene fotos).
        _ = _realtime.TripChangedAsync(dto.Id, (int)dto.Status, RealtimeReasons.Created, dto.PassengerId, null);
        _ = _realtime.RequestsChangedAsync(dto.Id, RealtimeReasons.Published);
        return Ok(dto);
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
        var denied = await Bugie.Trips.Api.Security.DriverAccess.EnsureApprovedDriverAsync(
            this, HttpContext.RequestServices.GetRequiredService<IDriversClient>(), CurrentUserId, ct);
        if(denied is not null) return denied;
        if(main is null || main.Length == 0)
            return BadRequest(new { error = "La foto principal del paquete es obligatoria." });
        var extras = (secondary ?? new List<IFormFile>()).Where(f => f.Length > 0).ToList();
        if(extras.Count > MaxSecondaryPhotos)
            return BadRequest(new { error = $"Máximo {MaxSecondaryPhotos} fotos adicionales." });
        foreach(var f in extras.Prepend(main))
        {
            var err = ValidatePhoto(f);
            if(err is not null) return BadRequest(new { error = err });
        }

        try
        {
            // Primero se validan las reglas (envio, aceptado, no verificado
            // antes). Si fallan, no se guarda ninguna foto.
            trip.SubmitPickupVerification(observation?.Trim());

            await using(var s = main.OpenReadStream())
            {
                var stored = await _storage.UploadAsync(s, main.FileName, main.ContentType,
                    $"trips/{tripId}/pickup", ct);
                await _photos.AddAsync(
                    TripPhoto.Create(tripId, stored.PublicUrl, TripPhotoKind.PickupMain, CurrentUserId), ct);
            }

            foreach(var f in extras)
            {
                await using var s = f.OpenReadStream();
                var stored = await _storage.UploadAsync(s, f.FileName, f.ContentType,
                    $"trips/{tripId}/pickup", ct);
                await _photos.AddAsync(
                    TripPhoto.Create(tripId, stored.PublicUrl, TripPhotoKind.PickupSecondary, CurrentUserId), ct);
            }

            await _trips.UpdateAsync(trip, ct);
            // Aviso al remitente: push + correo.
            _ = _notify.NotifyPassengerPackagePickedUpAsync(trip.PassengerId, tripId, trip.PackageDescription);
            _ = _realtime.TripChangedAsync(trip, RealtimeReasons.PickupVerified);
            return Ok(new { verified = true });
        }
        catch(InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    // ── Conductor: confirmar la entrega en destino ─────────────────────────
    // Foto de la entrega + nombre de quien recibio. Sin esto no se puede
    // completar un envio.
    [HttpPost("{tripId:guid}/delivery-confirmation")]
    public async Task<IActionResult> DeliveryConfirmation(
        Guid tripId,
        [FromForm] IFormFile? photo,
        [FromForm] string? receivedBy,
        CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Envio no encontrado." });
        if(trip.DriverId != CurrentUserId) return Forbid();
        var denied = await Bugie.Trips.Api.Security.DriverAccess.EnsureApprovedDriverAsync(
            this, HttpContext.RequestServices.GetRequiredService<IDriversClient>(), CurrentUserId, ct);
        if(denied is not null) return denied;
        if(photo is null || photo.Length == 0)
            return BadRequest(new { error = "La foto de la entrega es obligatoria." });
        if(string.IsNullOrWhiteSpace(receivedBy))
            return BadRequest(new { error = "Indica quién recibió el envío." });
        var photoErr = ValidatePhoto(photo);
        if(photoErr is not null) return BadRequest(new { error = photoErr });

        try
        {
            trip.ConfirmDelivery(receivedBy.Trim().Length > 120 ? receivedBy.Trim()[..120] : receivedBy.Trim());

            await using var s = photo.OpenReadStream();
            var stored = await _storage.UploadAsync(s, photo.FileName, photo.ContentType,
                $"trips/{tripId}/delivery", ct);
            await _photos.AddAsync(
                TripPhoto.Create(tripId, stored.PublicUrl, TripPhotoKind.DeliveryProof, CurrentUserId), ct);

            await _trips.UpdateAsync(trip, ct);
            // Aviso al remitente: push + correo.
            _ = _notify.NotifyPassengerPackageDeliveredAsync(trip.PassengerId, tripId, trip.DeliveryReceivedBy ?? receivedBy.Trim());
            _ = _realtime.TripChangedAsync(trip, RealtimeReasons.DeliveryConfirmed);
            return Ok(new { confirmed = true, trip.DeliveryReceivedBy, trip.DeliveryConfirmedAt });
        }
        catch(InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    // ── Listar fotos de un envio ────────────────────────────────────────────
    // El pasajero, el conductor del viaje o un admin. Ademas, cualquier
    // conductor puede ver las fotos de un ENVIO que aun esta disponible
    // (Pendiente o Negociando: los mismos estados en que la lista de
    // solicitudes se lo muestra), para decidir antes de tomarlo.
    [HttpGet("{tripId:guid}/photos")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewComplaints, Perm.ViewSosCenter, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewPayments, Perm.ViewCommissions, SkipForNonAdmins = true)]
    public async Task<IActionResult> GetPhotos(Guid tripId, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Envio no encontrado." });

        var isParticipant = trip.PassengerId == CurrentUserId || trip.DriverId == CurrentUserId;
        var isOpenDeliveryForDriver = User.IsInRole("driver")
            && trip.ServiceType == ServiceType.Delivery
            && (trip.Status == TripStatus.Pending || trip.Status == TripStatus.Negotiating);
        if(!isParticipant && !isOpenDeliveryForDriver && !User.IsInRole("admin"))
            return Forbid();

        var photos = await _photos.GetByTripAsync(tripId, ct);
        return Ok(photos.Select(p => new { p.Id, p.Url, Kind = (int)p.Kind, p.CreatedAt }));
    }
}
