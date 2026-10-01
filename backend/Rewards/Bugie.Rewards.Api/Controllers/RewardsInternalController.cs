using MediatR;
using Microsoft.AspNetCore.Mvc;
using Bugie.Rewards.Application.Commands;
using Bugie.Rewards.Application.Queries;

namespace Bugie.Rewards.Api.Controllers;

/// <summary>
/// Entrada de eventos desde otros modulos. No usa JWT de usuario: se protege con
/// el header X-Internal-Token, igual que DriversInternalController.
/// </summary>
[ApiController]
[Route("api/rewards/internal")]
public class RewardsInternalController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IConfiguration _config;
    private readonly ILogger<RewardsInternalController> _log;

    public RewardsInternalController(
        IMediator mediator,
        IConfiguration config,
        ILogger<RewardsInternalController> log)
    {
        _mediator = mediator;
        _config   = config;
        _log      = log;
    }

    public record TripRatedRequest(
        Guid TripId,
        Guid PassengerId,
        Guid DriverId,
        byte Stars);

    /// <summary>
    /// POST /api/rewards/internal/trip-rated
    /// Lo manda la bandeja de salida de Trips cuando el pasajero califica.
    /// </summary>
    [HttpPost("trip-rated")]
    public async Task<IActionResult> TripRated(
        [FromBody] TripRatedRequest req, CancellationToken ct)
    {
        var result = await _mediator.Send(new AccrueRatingPointsCommand(
            req.TripId, req.PassengerId, req.DriverId, req.Stars), ct);

        _log.LogInformation(
            "Calificación del viaje {TripId}: {P} puntos al pasajero, {D} al conductor",
            req.TripId, result.PassengerPoints, result.DriverPoints);

        return Ok(result);
    }

    public record ReferralRequest(
        Guid    NewUserId,
        string  NewUserType,
        string  Code,
        string? NewUserEmail);

    /// <summary>
    /// POST /api/rewards/internal/referral
    /// Lo llama Auth cuando alguien se registra con un código de invitación.
    ///
    /// Siempre responde 200, incluso si el código no existe: el registro ya
    /// ocurrió y no tiene sentido devolver un error que nadie puede atender.
    /// El campo "applied" dice si se acreditaron puntos.
    /// </summary>
    [HttpPost("referral")]
    public async Task<IActionResult> Referral(
        [FromBody] ReferralRequest req, CancellationToken ct)
    {
        try
        {
            var result = await _mediator.Send(new RegisterReferralCommand(
                req.NewUserId, req.NewUserType, req.Code ?? string.Empty, req.NewUserEmail), ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error registrando el referido de {UserId}", req.NewUserId);
            return Ok(new { applied = false, pointsAwarded = 0, reason = "Error interno." });
        }
    }

    public record TripCompletedRequest(
        Guid      TripId,
        Guid      PassengerId,
        Guid?     DriverId,
        decimal   Amount,
        string    PaymentMethod,
        DateTime? CompletedAt = null);

    /// <summary>
    /// POST /api/rewards/internal/trip-completed
    /// Lo llama el outbox de Trips cuando un viaje se completa.
    ///
    /// Es idempotente: si el mismo TripId llega varias veces, solo la primera
    /// acredita puntos. Por eso el outbox puede reintentar sin miedo.
    /// </summary>
    [HttpPost("trip-completed")]
    public async Task<IActionResult> TripCompleted(
        [FromBody] TripCompletedRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        var expected = _config["InternalToken"] ?? string.Empty;
        if (string.IsNullOrWhiteSpace(expected))
        {
            _log.LogError("InternalToken no configurado en appsettings.");
            return StatusCode(500, new { error = "Configuracion incompleta." });
        }
        if (string.IsNullOrWhiteSpace(token) || token != expected)
        {
            _log.LogWarning("Intento de acceso a /rewards/internal/trip-completed con token invalido.");
            return Unauthorized(new { error = "Token interno invalido." });
        }

        if (req.TripId == Guid.Empty)
            return BadRequest(new { error = "TripId requerido." });
        if (req.PassengerId == Guid.Empty)
            return BadRequest(new { error = "PassengerId requerido." });

        try
        {
            var result = await _mediator.Send(new AccrueTripPointsCommand(
                req.TripId, req.PassengerId, req.DriverId,
                req.Amount, req.PaymentMethod ?? string.Empty, req.CompletedAt), ct);

            _log.LogInformation(
                "Puntos del viaje {TripId}: pasajero +{P}, conductor +{D}",
                req.TripId, result.PassengerPoints, result.DriverPoints);

            return Ok(result);
        }
        catch (Exception ex)
        {
            // Devolvemos 500 a proposito: el outbox de Trips reintentara.
            _log.LogError(ex, "Error acreditando puntos del viaje {TripId}", req.TripId);
            return StatusCode(500, new { error = "Error al acreditar puntos." });
        }
    }

    // ─────────────────── CUPONES (para Trips, mas adelante) ───────────────────

    /// <summary>
    /// GET /api/rewards/internal/coupon/{code}
    /// Valida un cupon sin consumirlo. Lo usara Trips para mostrar el descuento
    /// antes de confirmar el viaje.
    ///
    /// Hoy nadie lo llama: queda listo para el paso en que se apliquen los
    /// descuentos en la tarifa. Trips NO fue modificado en este paso.
    /// </summary>
    [HttpGet("coupon/{code}")]
    public async Task<IActionResult> GetCoupon(
        string code,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;

        var dto = await _mediator.Send(new GetRedemptionByCodeQuery(code), ct);
        return dto is null
            ? NotFound(new { error = "Cupon no encontrado." })
            : Ok(dto);
    }

    public record UseCouponRequest(Guid? ReferenceId, string? Note);

    /// <summary>
    /// POST /api/rewards/internal/coupon/{code}/use
    /// Consume el cupon y lo ata al viaje donde se aplico.
    /// </summary>
    [HttpPost("coupon/{code}/use")]
    public async Task<IActionResult> UseCoupon(
        string code,
        [FromBody] UseCouponRequest? body,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;

        try
        {
            var dto = await _mediator.Send(
                new UseRedemptionCommand(code, body?.ReferenceId, body?.Note), ct);
            return Ok(dto);
        }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// Valida el header X-Internal-Token. Devuelve false y deja en 'error' la
    /// respuesta que hay que retornar.
    /// </summary>
    private bool IsInternalTokenValid(string? token, out IActionResult? error)
    {
        var expected = _config["InternalToken"] ?? string.Empty;

        if (string.IsNullOrWhiteSpace(expected))
        {
            _log.LogError("InternalToken no configurado en appsettings.");
            error = StatusCode(500, new { error = "Configuracion incompleta." });
            return false;
        }

        if (string.IsNullOrWhiteSpace(token) || token != expected)
        {
            _log.LogWarning("Intento de acceso interno con token invalido.");
            error = Unauthorized(new { error = "Token interno invalido." });
            return false;
        }

        error = null;
        return true;
    }
}
