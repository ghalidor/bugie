using System.Linq;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Application.DTOs;
using Bugie.Drivers.Application.Queries;
using Bugie.Drivers.Domain.Enums;

namespace Bugie.Drivers.Api.Controllers;

[ApiController]
[Route("api/drivers")]
[Authorize]
public class DriversController : ControllerBase
{
    private readonly IMediator _mediator;
    public DriversController(IMediator mediator) => _mediator = mediator;

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // ── Conductor ───────────────────────────────────────────────────────────

    [HttpPost("register")]
    public async Task<IActionResult> Register(CancellationToken ct) =>
        Ok(await _mediator.Send(new RegisterDriverCommand(CurrentUserId), ct));

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetMyDriverProfileQuery(CurrentUserId), ct));

    [HttpGet("{id:guid}/detail")]
    public async Task<IActionResult> Detail(Guid id, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetDriverDetailQuery(id), ct));

    [HttpPut("submit-review")]
    public async Task<IActionResult> SubmitReview(CancellationToken ct) =>
        Ok(await _mediator.Send(new SubmitForReviewCommand(CurrentUserId), ct));

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
            return StatusCode(500, new { error = "Error al conectar.", detail = ex.Message });
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

    [HttpPut("location")]
    public async Task<IActionResult> UpdateLocation([FromBody] UpdateLocationRequest req, CancellationToken ct)
    {
        await _mediator.Send(new UpdateLocationCommand(
            CurrentUserId, req.Lat, req.Lng, req.TripId, req.SpeedKmh, req.Heading), ct);
        return Ok();
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
    // está su conductor. No requiere rol admin: cualquier usuario autenticado
    // puede consultar (el [Authorize] de la clase ya cubre eso).
    // Si el conductor no tiene posición reportada, devuelve 204 No Content.
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("by-user/{userId:guid}/location")]
    public async Task<IActionResult> LocationByUserId(Guid userId, CancellationToken ct)
    {
        var driver = await _mediator.Send(new GetMyDriverProfileQuery(userId), ct);
        if(driver is null) return NotFound(new { error = "Conductor no encontrado." });

        // Si el conductor está offline, devolvemos 204 NoContent.
        // Esto evita que clientes (Trips.Api, GetPendingTripsHandler, GetActiveTripHandler)
        // sigan tratándolo como "disponible". Sin esto, un conductor que tocó
        // "Desconectarme" seguiría viendo viajes pending porque su última
        // ubicación sigue en BD.
        if(!driver.IsOnline) return NoContent();

        if(driver.CurrentLat is null || driver.CurrentLng is null)
            return NoContent();

        return Ok(new
        {
            lat = driver.CurrentLat.Value,
            lng = driver.CurrentLng.Value,
            // Pendiente: agregar Driver.CurrentLocationAt al schema para
            // exponer cuándo fue el último ping. Por ahora null.
            updatedAt = (DateTime?)null,
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
    public async Task<IActionResult> BulkVehicles(
        [FromQuery(Name = "ids")] Guid[] ids, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetBulkVehiclesQuery(ids ?? Array.Empty<Guid>()), ct));

    // ── Calificaciones ───────────────────────────────────────────────────────

    [HttpPost("reviews")]
    public async Task<IActionResult> AddReview([FromBody] AddReviewRequest req, CancellationToken ct)
    {
        await _mediator.Send(new AddReviewCommand(
            req.DriverId, req.PassengerId, req.TripId, req.Rating, req.Comment), ct);
        return Ok(new { message = "Calificación registrada." });
    }

    [HttpGet("nearby")]
    [AllowAnonymous]
    public async Task<IActionResult> Nearby(
        [FromQuery] double lat, [FromQuery] double lng,
        [FromQuery] double radiusKm = 5, [FromQuery] int maxResults = 10,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetNearbyDriversQuery(lat, lng, radiusKm, maxResults), ct));

    // ── Admin ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Lista de conductores que requieren revisión del admin.
    /// Incluye PendingDocs (1), UnderReview (2) y ExpiredDocs (6).
    /// </summary>
    [HttpGet("pending")]
    [Authorize(Roles = "admin")]
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
    public async Task<IActionResult> PendingPaged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetPendingDriversPagedQuery(page, pageSize, search), ct));

    [HttpPut("{id:guid}/approve")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct) =>
        Ok(await _mediator.Send(new ApproveDriverCommand(id), ct));

    [HttpGet("online")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Online(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetOnlineDriversQuery(), ct));

    [HttpGet]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetAll(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetAllDriversQuery(), ct));

    /// <summary>
    /// Lista paginada de conductores con filtros opcionales.
    /// GET /api/drivers/paged?page=1&amp;pageSize=25&amp;status=3&amp;online=true&amp;search=jose
    /// - status: 1-6 (DriverStatus). Omitir = todos.
    /// - online: true/false. Omitir = sin filtro.
    /// - search: nombre o email.
    /// </summary>
    [HttpGet("paged")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Paged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] int? status = null,
        [FromQuery] bool? online = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetDriversPagedQuery(page, pageSize, status, online, search), ct));

    /// <summary>
    /// KPIs de conductores. Respeta los mismos filtros que /paged.
    /// GET /api/drivers/stats?status=3&amp;online=true&amp;search=jose
    /// </summary>
    [HttpGet("stats")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Stats(
        [FromQuery] int? status = null,
        [FromQuery] bool? online = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetDriversStatsQuery(status, online, search), ct));
}