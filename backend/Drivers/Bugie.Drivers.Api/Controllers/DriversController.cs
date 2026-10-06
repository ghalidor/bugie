using System.Linq;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using System.Security.Claims;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Application.Queries;
using Bugie.Drivers.Application.Services.Location;
using Microsoft.Extensions.Options;
using Bugie.Drivers.Domain.Enums;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Api.Security;

namespace Bugie.Drivers.Api.Controllers;

[ApiController]
[Route("api/drivers")]
[Authorize]
public class DriversController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IAdminEventsPublisher _adminEvents;
    private readonly ITripsClient _trips;
    private readonly IConfiguration _cfg;
    private readonly DriverLiveLocations _live;
    private readonly LocationOptions _location;
    public DriversController(IMediator mediator, IAdminEventsPublisher adminEvents,
        ITripsClient trips, IConfiguration cfg, DriverLiveLocations live, IOptions<LocationOptions> location)
    {
        _mediator = mediator;
        _adminEvents = adminEvents;
        _trips = trips;
        _cfg = cfg;
        _live = live;
        _location = location.Value;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // Llamada de otro modulo (Trips) con X-Internal-Token valido: ese modulo
    // ya hizo su propia autorizacion del usuario.
    private bool IsInternalCall =>
        InternalTokenCheck.Matches(Request.Headers["X-Internal-Token"].ToString(), _cfg["InternalToken"]);

    private bool IsAdmin => User.IsInRole("admin");

    // ── Conductor ───────────────────────────────────────────────────────────

    [HttpPost("register")]
    public async Task<IActionResult> Register(CancellationToken ct) =>
        Ok(await _mediator.Send(new RegisterDriverCommand(CurrentUserId), ct));

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetMyDriverProfileQuery(CurrentUserId), ct));

    // Detalle completo (documentos, datos del usuario): solo admin, el propio
    // conductor o un modulo interno. Para cualquier otro usuario, 403.
    [HttpGet("{id:guid}/detail")]
    [RequirePermission(Perm.ViewDrivers, Perm.ViewVerification, SkipForNonAdmins = true)]
    [AllowAnonymous] // se valida abajo: JWT o X-Internal-Token
    public async Task<IActionResult> Detail(Guid id, CancellationToken ct)
    {
        if(!IsInternalCall && User.Identity?.IsAuthenticated != true) return Unauthorized();
        var detail = await _mediator.Send(new GetDriverDetailQuery(id), ct);
        if(IsInternalCall || IsAdmin) return Ok(detail);
        if(detail is null) return Forbid();
        return detail.Driver.UserId == CurrentUserId ? Ok(detail) : Forbid();
    }

    [HttpPut("submit-review")]
    public async Task<IActionResult> SubmitReview(CancellationToken ct)
    {
        DriverDto dto;
        try { dto = await _mediator.Send(new SubmitForReviewCommand(CurrentUserId), ct); }
        catch(KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
        // Aviso en vivo al panel admin (Centro de avisos). Fire-and-forget.
        _adminEvents.Publish("driver_review",
            "Conductor por revisar",
            "Un conductor envió sus documentos a revisión.",
            "/admin/verificacion", "view:verification");
        return Ok(dto);
    }

    [HttpPut("go-online")]
    public async Task<IActionResult> GoOnline([FromBody] GoOnlineRequest req, CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(new GoOnlineCommand(CurrentUserId, req.Lat, req.Lng), ct);
            return Ok(dto);
        }
        catch(InvalidOperationException ex)
        {
            // Conductor no aprobado: NO debe poder conectarse hasta que el
            // admin lo apruebe.
            Console.WriteLine($"[GoOnline] InvalidOperation: {ex.Message}");
            return Conflict(new { error = ex.Message });
        }
        catch(KeyNotFoundException ex)
        {
            Console.WriteLine($"[GoOnline] NotFound: {ex.Message}");
            return NotFound(new { error = ex.Message });
        }
        catch(Exception ex)
        {
            // Cualquier otro error (SQL, columna faltante, etc.) antes era 500 mudo.
            Console.WriteLine($"[GoOnline] ERROR INESPERADO: {ex.GetType().Name}: {ex.Message}");
            Console.WriteLine(ex.StackTrace);
            return StatusCode(500, new { error = "Error al conectar. Intenta de nuevo." });
        }
    }

    [HttpPut("go-offline")]
    public async Task<IActionResult> GoOffline(CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(new GoOfflineCommand(CurrentUserId), ct);
            return Ok(dto);
        }
        catch(InvalidOperationException ex)
        {
            // Conductor tiene viaje activo: no puede desconectarse.
            return Conflict(new { error = ex.Message });
        }
    }

    // Un punto GPS (app web, simulador, seed). Misma ruta interna que el lote:
    // valida, filtra, deja la posicion en memoria y encola; la base se escribe
    // en segundo plano (LocationWriterService). Responde 200 vacio como siempre.
    [HttpPut("location")]
    public async Task<IActionResult> UpdateLocation([FromBody] UpdateLocationRequest req, CancellationToken ct)
    {
        await _mediator.Send(new UpdateLocationCommand(
            CurrentUserId, req.Lat, req.Lng, req.TripId, req.SpeedKmh, req.Heading), ct);
        return Ok();
    }

    /// <summary>
    /// PUT /api/drivers/location/batch
    /// Varios puntos GPS del conductor autenticado en una sola peticion (la app
    /// los junta y los manda cada pocos segundos).
    /// Body: { driverId, tripId?, points: [ { lat, lng, speedKmh?, heading?, recordedAt } ] }
    ///   - recordedAt: hora de Peru sin zona (como el resto de la API).
    ///   - maximo Location:MaxBatchPoints puntos (default 50): 400 si se pasa.
    ///   - se ordenan por recordedAt; los puntos con fecha futura (> 2 min), mas
    ///     viejos que 1 h, con coordenadas invalidas o repetidos (menos de 15 m y
    ///     3 s del anterior) se descartan y se cuentan, no cortan el lote.
    /// Respuesta 202 { received, accepted, discarded }. 404 si el usuario no es conductor.
    /// </summary>
    [HttpPut("location/batch")]
    public async Task<IActionResult> UpdateLocationBatch([FromBody] UpdateLocationBatchRequest req, CancellationToken ct)
    {
        if(req.Points is null || req.Points.Count == 0)
            return BadRequest(new { error = "Debes enviar al menos un punto." });
        if(req.Points.Count > _location.MaxBatchPoints)
            return BadRequest(new { error = $"Maximo {_location.MaxBatchPoints} puntos por peticion." });

        var result = await _mediator.Send(new UpdateLocationBatchCommand(CurrentUserId, req.TripId, req.Points), ct);
        return Accepted(new { received = result.Received, accepted = result.Accepted, discarded = result.Discarded });
    }

    /// <summary>
    /// POST /api/drivers/me/check-expiration
    /// El conductor (o el frontend antes de entrar a rutas críticas) llama a este endpoint
    /// para verificar si tiene documentos vencidos. Si los tiene, se le marca como
    /// ExpiredDocs automáticamente y queda bloqueado.
    /// </summary>
    [HttpPost("me/check-expiration")]
    public async Task<IActionResult> CheckExpiration(CancellationToken ct) =>
        Ok(await _mediator.Send(new CheckExpiredDocumentsCommand(CurrentUserId), ct));

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/drivers/by-user/{userId}/status
    // Devuelve el estado del conductor por userId. Usado por Trips.Api
    // para validar antes de aceptar / proponer.
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("by-user/{userId:guid}/status")]
    public async Task<IActionResult> StatusByUserId(Guid userId, CancellationToken ct)
    {
        var driver = await _mediator.Send(new GetMyDriverProfileQuery(userId), ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        return Ok(new
        {
            id = driver.Id,
            userId = driver.UserId,
            status = (int)driver.Status,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/drivers/by-user/{userId}/location
    // Devuelve la última posición conocida del conductor por su userId.
    // Lo usa el pasajero (vía Trips.Api) durante el viaje para ver dónde
    // está su conductor. Solo pueden verla: admin, el propio conductor, un
    // modulo interno (X-Internal-Token) o el pasajero que tiene AHORA un viaje
    // activo con ese conductor (se pregunta a Trips). Resto: 403.
    // Si el conductor no tiene posición reportada, devuelve 204 No Content.
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("by-user/{userId:guid}/location")]
    [RequirePermission(Perm.ViewLiveMap, Perm.ViewSosCenter, Perm.ViewTrips, Perm.ViewDrivers, SkipForNonAdmins = true)]
    [AllowAnonymous] // se valida abajo: JWT o X-Internal-Token
    public async Task<IActionResult> LocationByUserId(Guid userId, CancellationToken ct)
    {
        if(!IsInternalCall && User.Identity?.IsAuthenticated != true) return Unauthorized();
        if(!IsInternalCall && !IsAdmin && userId != CurrentUserId
            && !await _trips.HasActiveTripWithAsync(CurrentUserId, userId, ct))
            return Forbid();

        var driver = await _mediator.Send(new GetMyDriverProfileQuery(userId), ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        // Si el conductor está offline, devolvemos 204 NoContent.
        // Esto evita que clientes (Trips.Api, GetPendingTripsHandler, GetActiveTripHandler)
        // sigan tratándolo como "disponible". Sin esto, un conductor que tocó
        // "Desconectarme" seguiría viendo viajes pending porque su última
        // ubicación sigue en BD.
        if(!driver.IsOnline) return NoContent();

        // Posicion en memoria primero (mas fresca que la base); si no hay dato
        // vigente (p.ej. API recien reiniciada), la de la base.
        var live = _live.Get(userId, TimeSpan.FromMinutes(_location.StaleMinutes));
        var lat = live?.Lat ?? driver.CurrentLat;
        var lng = live?.Lng ?? driver.CurrentLng;
        if(lat is null || lng is null)
            return NoContent();

        return Ok(new
        {
            lat = lat.Value,
            lng = lng.Value,
            // Hora del ultimo punto si esta en memoria; null si salio de la base.
            updatedAt = live?.RecordedAtUtc,
        });
    }

    // ── Vehículos ────────────────────────────────────────────────────────────

    [HttpPost("vehicles")]
    public async Task<IActionResult> AddVehicle([FromBody] AddVehicleRequest req, CancellationToken ct)
    {
        var driver = await _mediator.Send(new GetMyDriverProfileQuery(CurrentUserId), ct)
            ?? throw new KeyNotFoundException("Perfil de conductor no encontrado.");
        return Ok(await _mediator.Send(
            new AddVehicleCommand(driver.Id, req.Plate, req.Brand, req.Model, req.Year, req.Color), ct));
    }

    [HttpPut("vehicles/{vehicleId:guid}/activate")]
    public async Task<IActionResult> ActivateVehicle(Guid vehicleId, CancellationToken ct) =>
        Ok(await _mediator.Send(new SwitchActiveVehicleCommand(CurrentUserId, vehicleId), ct));

    [HttpGet("bulk-vehicles")]
    [RequirePermission(Perm.ViewLiveMap, Perm.ViewTrips, Perm.ViewDrivers, SkipForNonAdmins = true)]
    public async Task<IActionResult> BulkVehicles(
        [FromQuery(Name = "ids")] Guid[] ids, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetBulkVehiclesQuery(ids ?? Array.Empty<Guid>()), ct));

    // Conductores online cerca de un punto.
    //  - Modulo interno (Trips, X-Internal-Token) o admin: respuesta completa.
    //  - Otro usuario autenticado: solo posiciones redondeadas (~100 m), sin
    //    ids ni placa.
    //  - Anonimo: 401.
    // radiusKm y maxResults se limitan para que no se pueda barrer la ciudad.
    [HttpGet("nearby")]
    [AllowAnonymous]
    public async Task<IActionResult> Nearby(
        [FromQuery] double lat, [FromQuery] double lng,
        [FromQuery] double radiusKm = 5, [FromQuery] int maxResults = 10,
        CancellationToken ct = default)
    {
        var full = IsInternalCall || (User.Identity?.IsAuthenticated == true && IsAdmin);
        if(!full && User.Identity?.IsAuthenticated != true)
            return Unauthorized(new { error = "Autenticación requerida." });

        if(double.IsNaN(radiusKm) || radiusKm <= 0) radiusKm = 5;
        radiusKm = Math.Min(radiusKm, full ? 30 : 10);
        maxResults = Math.Clamp(maxResults, 1, full ? 50 : 20);

        var list = await _mediator.Send(new GetNearbyDriversQuery(lat, lng, radiusKm, maxResults), ct);
        if(full) return Ok(list);

        return Ok(list.Select(d => new
        {
            lat = Math.Round(d.Lat, 3),
            lng = Math.Round(d.Lng, 3),
            distanceKm = Math.Round(d.DistanceKm, 1),
        }));
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Lista de conductores que requieren revisión del admin.
    /// Incluye PendingDocs (1), UnderReview (2) y ExpiredDocs (6).
    /// </summary>
    [HttpGet("pending")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewVerification, Perm.ViewDrivers)]
    public async Task<IActionResult> Pending(CancellationToken ct)
    {
        var pendingDocs = await _mediator.Send(new GetDriversByStatusQuery(DriverStatus.PendingDocs), ct);
        var underReview = await _mediator.Send(new GetDriversByStatusQuery(DriverStatus.UnderReview), ct);
        var expiredDocs = await _mediator.Send(new GetDriversByStatusQuery(DriverStatus.ExpiredDocs), ct);
        var all = pendingDocs.Concat(underReview).Concat(expiredDocs)
                             .OrderBy(d => d.CreatedAt)
                             .ToList();
        return Ok(all);
    }

    /// <summary>
    /// Lista paginada de conductores PENDIENTES de verificación.
    /// Filtra automáticamente por status 1, 2 y 6 (los que el admin debe revisar).
    /// Ordenados por CreatedAt ASC (más viejos primero, FIFO).
    /// GET /api/drivers/pending/paged?page=1&amp;pageSize=10&amp;search=jose
    /// </summary>
    [HttpGet("pending/paged")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewVerification, Perm.ViewDrivers)]
    public async Task<IActionResult> PendingPaged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetPendingDriversPagedQuery(page, pageSize, search), ct));

    /// <summary>
    /// Aprobar conductor. Body opcional: { "reason": "..." }.
    /// - Documentos completos: aprueba sin más.
    /// - Incompletos: exige motivo (aprobación por excepción, plazo de 3 días).
    /// - 409 si tiene faltas (solo puede aprobarse con documentos completos).
    /// Quién aprobó (id y nombre) sale del token y queda en la auditoría.
    /// </summary>
    public record ApproveDriverRequest(string? Reason);

    [HttpPut("{id:guid}/approve")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewVerification, Perm.ViewDrivers)]
    [RequirePermission(Perm.ActionApproveDriver)]
    public async Task<IActionResult> Approve(
        Guid id,
        [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)]
        ApproveDriverRequest? body,
        CancellationToken ct)
    {
        try
        {
            var adminName = User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Email);
            return Ok(await _mediator.Send(
                new ApproveDriverCommand(id, body?.Reason, CurrentUserId, adminName), ct));
        }
        catch(KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch(ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpGet("online")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewLiveMap)]
    public async Task<IActionResult> Online(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetOnlineDriversQuery(), ct));

    /// <summary>
    /// Lista paginada de conductores con filtros opcionales.
    /// GET /api/drivers/paged?page=1&amp;pageSize=25&amp;status=3&amp;online=true&amp;search=jose
    /// - status: 1-6 (DriverStatus). Omitir = todos.
    /// - online: true/false. Omitir = sin filtro.
    /// - search: nombre o email.
    /// - openReview: true = solo con solicitud de revisión abierta; false = sin ella. Omitir = sin filtro.
    /// </summary>
    [HttpGet("paged")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewDrivers, Perm.ViewDriverPayouts)]
    public async Task<IActionResult> Paged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] int? status = null,
        [FromQuery] bool? online = null,
        [FromQuery] string? search = null,
        [FromQuery] bool? openReview = null,
        [FromQuery] bool? deleted = false,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetDriversPagedQuery(page, pageSize, status, online, search, openReview, deleted), ct));

    /// <summary>
    /// KPIs de conductores. Respeta los mismos filtros que /paged.
    /// GET /api/drivers/stats?status=3&amp;online=true&amp;search=jose
    /// </summary>
    [HttpGet("stats")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewDrivers)]
    public async Task<IActionResult> Stats(
        [FromQuery] int? status = null,
        [FromQuery] bool? online = null,
        [FromQuery] string? search = null,
        [FromQuery] bool? openReview = null,
        [FromQuery] bool? deleted = false,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetDriversStatsQuery(status, online, search, openReview, deleted), ct));
}