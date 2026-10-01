using MediatR;
using Microsoft.AspNetCore.Mvc;
using Bugie.Drivers.Application.Commands;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Controller para llamadas internas entre módulos.
/// NO requiere JWT de usuario, pero sí un header X-Internal-Token
/// que debe coincidir con el configurado en appsettings.
/// </summary>
[ApiController]
[Route("api/drivers/internal")]
public class DriversInternalController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IConfiguration _config;
    private readonly ILogger<DriversInternalController> _log;

    public DriversInternalController(
        IMediator mediator,
        IConfiguration config,
        ILogger<DriversInternalController> log)
    {
        _mediator = mediator;
        _config = config;
        _log = log;
    }

    public record InternalRegisterRequest(Guid UserId);

    /// <summary>
    /// POST /api/drivers/internal/register
    /// Crea perfil de conductor para un userId.
    /// Llamado desde Auth.Api al registrar un usuario con rol 'driver'.
    /// </summary>
    [HttpPost("register")]
    public async Task<IActionResult> Register(
        [FromBody] InternalRegisterRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        // Validar token interno
        var expected = _config["InternalToken"] ?? string.Empty;
        if(string.IsNullOrWhiteSpace(expected))
        {
            _log.LogError("InternalToken no configurado en appsettings.");
            return StatusCode(500, new { error = "Configuración incompleta." });
        }
        if(string.IsNullOrWhiteSpace(token) || token != expected)
        {
            _log.LogWarning("Intento de acceso a /internal/register con token inválido.");
            return Unauthorized(new { error = "Token interno inválido." });
        }

        if(req.UserId == Guid.Empty)
            return BadRequest(new { error = "UserId requerido." });

        try
        {
            var driver = await _mediator.Send(new RegisterDriverCommand(req.UserId), ct);
            _log.LogInformation("Perfil de conductor creado para userId {UserId}", req.UserId);
            return Ok(driver);
        }
        catch(InvalidOperationException ex)
        {
            // Si el perfil ya existe, devolvemos 200 igual (idempotente para evitar errores en reintentos)
            _log.LogWarning("Conflicto al crear conductor para {UserId}: {Message}", req.UserId, ex.Message);
            return Ok(new { message = "El perfil ya existía o no se pudo crear.", reason = ex.Message });
        }
        catch(Exception ex)
        {
            _log.LogError(ex, "Error inesperado creando conductor para {UserId}", req.UserId);
            return StatusCode(500, new { error = "Error al crear el perfil de conductor." });
        }
    }

    public record AddRatingRequest(Guid DriverUserId, byte Stars);

    /// <summary>
    /// POST /api/drivers/internal/add-rating
    /// Llamado desde Trips.Api cuando un pasajero califica al conductor.
    /// Drivers actualiza Driver.Rating (promedio incremental) y Driver.TotalRatings.
    /// </summary>
    [HttpPost("add-rating")]
    public async Task<IActionResult> AddRating(
        [FromBody] AddRatingRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        // Validar token interno (mismo patrón que Register)
        var expected = _config["InternalToken"] ?? string.Empty;
        if(string.IsNullOrWhiteSpace(expected))
        {
            _log.LogError("InternalToken no configurado en appsettings.");
            return StatusCode(500, new { error = "Configuración incompleta." });
        }
        if(string.IsNullOrWhiteSpace(token) || token != expected)
        {
            _log.LogWarning("Intento de acceso a /internal/add-rating con token inválido.");
            return Unauthorized(new { error = "Token interno inválido." });
        }

        if(req.DriverUserId == Guid.Empty)
            return BadRequest(new { error = "DriverUserId requerido." });
        if(req.Stars < 1 || req.Stars > 5)
            return BadRequest(new { error = "Stars debe estar entre 1 y 5." });

        try
        {
            await _mediator.Send(new AddRatingCommand(req.DriverUserId, req.Stars), ct);
            return Ok();
        }
        catch(KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch(Exception ex)
        {
            _log.LogError(ex, "Error al agregar rating al conductor {UserId}", req.DriverUserId);
            return StatusCode(500, new { error = "Error al actualizar rating." });
        }
    }
}