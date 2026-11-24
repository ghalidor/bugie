using MediatR;
using Microsoft.AspNetCore.Mvc;
using Bugie.Rewards.Application.Commands;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Api.Filters;
using Bugie.Rewards.Domain.External;

namespace Bugie.Rewards.Api.Controllers;

/// <summary>
/// Entrada de eventos desde otros modulos. No usa JWT de usuario: se protege con
/// el header X-Internal-Token, igual que DriversInternalController.
/// </summary>
[ApiController]
[Route("api/rewards/internal")]
[InternalToken] // todo el controlador exige X-Internal-Token
public class RewardsInternalController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly IConfiguration _config;
    private readonly ILogger<RewardsInternalController> _log;
    private readonly ITripsStatsClient _trips;

    public RewardsInternalController(
        IMediator mediator,
        IConfiguration config,
        ILogger<RewardsInternalController> log,
        ITripsStatsClient trips)
    {
        _mediator = mediator;
        _config   = config;
        _log      = log;
        _trips    = trips;
    }

    public record TripRatedRequest(
        Guid TripId,
        Guid PassengerId,
        Guid DriverId,
        byte Stars);

    /// <summary>
    /// POST /api/rewards/internal/trip-rated
    /// Lo manda la bandeja de salida de Trips cuando el pasajero califica.
    ///
    /// Antes de dar puntos se confirma con Trips que el viaje existe, está
    /// completado y que ESE pasajero lo calificó (las estrellas salen de Trips).
    /// </summary>
    [HttpPost("trip-rated")]
    public async Task<IActionResult> TripRated(
        [FromBody] TripRatedRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;
        if (req.TripId == Guid.Empty || req.PassengerId == Guid.Empty || req.DriverId == Guid.Empty)
            return BadRequest(new { error = "TripId, PassengerId y DriverId son requeridos." });

        var check = await _trips.GetRatingCheckAsync(req.TripId, ct);
        if (check is null)
            // Trips no respondió: 503 para que la bandeja de salida reintente.
            return StatusCode(503, new { error = "No se pudo verificar el viaje en Trips." });

        if (!check.Exists || !check.Completed || !check.Rated
            || check.PassengerId != req.PassengerId || check.RatedBy != req.PassengerId
            || check.DriverId != req.DriverId || check.Stars is null)
        {
            _log.LogWarning("Calificación del viaje {TripId} rechazada: no coincide con Trips.", req.TripId);
            return BadRequest(new { error = "El viaje no existe, no está completado o no fue calificado por ese pasajero." });
        }

        var result = await _mediator.Send(new AccrueRatingPointsCommand(
            req.TripId, req.PassengerId, req.DriverId, check.Stars.Value), ct);

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
        [FromBody] ReferralRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;
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
        DateTime? CompletedAt = null,
        // Tarifa antes del cupón (puntos del conductor). Null en eventos
        // antiguos: se usa Amount.
        decimal?  BaseAmount  = null);

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
        if (!IsInternalTokenValid(token, out var tokenError)) return tokenError!;

        if (req.TripId == Guid.Empty)
            return BadRequest(new { error = "TripId requerido." });
        if (req.PassengerId == Guid.Empty)
            return BadRequest(new { error = "PassengerId requerido." });

        try
        {
            var result = await _mediator.Send(new AccrueTripPointsCommand(
                req.TripId, req.PassengerId, req.DriverId,
                req.Amount, req.PaymentMethod ?? string.Empty, req.CompletedAt,
                req.BaseAmount), ct);

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

    // ─────────────────── CUPONES (para Trips) ─────────────────────────────────

    public record ValidateCouponRequest(
        string  Code,
        Guid    UserId,
        decimal Fare);

    /// <summary>
    /// POST /api/rewards/internal/coupon/validate
    /// Lo pregunta Trips antes de tocar la tarifa: si el cupón sirve para ese
    /// viaje y cuánto descuenta de verdad.
    ///
    /// Siempre responde 200. El campo "valid" dice si se puede, y "reason"
    /// explica por qué no, para mostrárselo al pasajero tal cual.
    /// </summary>
    [HttpPost("coupon/validate")]
    public async Task<IActionResult> ValidateCoupon(
        [FromBody] ValidateCouponRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;

        var dto = await _mediator.Send(new ValidateCouponForTripQuery(
            req.Code ?? string.Empty, req.UserId, req.Fare), ct);

        return Ok(dto);
    }

    public record ReserveCouponRequest(string Code, Guid UserId, Guid TripId, decimal Fare);

    /// <summary>
    /// POST /api/rewards/internal/coupon/reserve
    /// Trips aplica un cupón a un viaje: se valida y queda reservado para ese
    /// viaje (nadie más lo puede usar). Siempre 200: "valid" dice si se pudo y
    /// "reason" por qué no (p. ej. ya está aplicado a otro viaje).
    /// </summary>
    [HttpPost("coupon/reserve")]
    public async Task<IActionResult> ReserveCoupon(
        [FromBody] ReserveCouponRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;
        if (req.TripId == Guid.Empty || req.UserId == Guid.Empty)
            return BadRequest(new { error = "TripId y UserId son requeridos." });

        return Ok(await _mediator.Send(new ReserveTripCouponCommand(
            req.Code ?? string.Empty, req.UserId, req.TripId, req.Fare), ct));
    }

    public record ReleaseCouponRequest(string Code, Guid TripId, DateTime? RequestedAt = null);

    /// <summary>
    /// POST /api/rewards/internal/coupon/release
    /// El pasajero quitó el cupón o el viaje se canceló: la reserva se libera
    /// (vuelve a 'active', o 'expired' si ya venció). Idempotente: lo puede
    /// mandar la bandeja de salida de Trips cuantas veces haga falta.
    /// </summary>
    [HttpPost("coupon/release")]
    public async Task<IActionResult> ReleaseCoupon(
        [FromBody] ReleaseCouponRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;
        if (string.IsNullOrWhiteSpace(req.Code) || req.TripId == Guid.Empty)
            return BadRequest(new { error = "Code y TripId son requeridos." });

        try
        {
            var status = await _mediator.Send(new ReleaseTripCouponCommand(req.Code, req.TripId, req.RequestedAt), ct);
            if (status is not null)
                _log.LogInformation("Cupón {Code} liberado del viaje {TripId}: queda {Status}.", req.Code, req.TripId, status);
            return Ok(new { released = status is not null, status });
        }
        catch (Exception ex)
        {
            // 500 a propósito: la bandeja de salida de Trips reintenta.
            _log.LogError(ex, "Error liberando el cupón {Code} del viaje {TripId}", req.Code, req.TripId);
            return StatusCode(500, new { error = "No se pudo liberar el cupón." });
        }
    }

    public record ConsumeCouponRequest(string Code, Guid TripId, decimal AppliedDiscount);

    /// <summary>
    /// POST /api/rewards/internal/coupon/consume
    /// Lo manda la bandeja de salida de Trips al completar un viaje con cupón:
    /// la reserva pasa a 'used' y el sobrante (si lo hay) vuelve en puntos.
    /// Idempotente por viaje. 400/404 = no se puede (no reintentar);
    /// 500 = error temporal (la bandeja reintenta).
    /// </summary>
    [HttpPost("coupon/consume")]
    public async Task<IActionResult> ConsumeCoupon(
        [FromBody] ConsumeCouponRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;
        if (string.IsNullOrWhiteSpace(req.Code) || req.TripId == Guid.Empty)
            return BadRequest(new { error = "Code y TripId son requeridos." });

        try
        {
            var dto = await _mediator.Send(new UseTripCouponCommand(req.Code, req.TripId, req.AppliedDiscount), ct);
            _log.LogInformation("Cupón {Code} consumido en el viaje {TripId} (sobrante {Points} pts).",
                req.Code, req.TripId, dto.LeftoverPoints);
            return Ok(dto);
        }
        catch (KeyNotFoundException ex)
        {
            _log.LogWarning("Cupón {Code} del viaje {TripId}: {Error}", req.Code, req.TripId, ex.Message);
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            _log.LogWarning("Cupón {Code} del viaje {TripId} no se consumió: {Error}", req.Code, req.TripId, ex.Message);
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error consumiendo el cupón {Code} del viaje {TripId}", req.Code, req.TripId);
            return StatusCode(500, new { error = "No se pudo consumir el cupón." });
        }
    }

    /// <param name="AppliedDiscount">
    /// Lo que de verdad se descontó del viaje. Con esto (y ReferenceId = viaje)
    /// el cupón de monto que valía más devuelve el sobrante en puntos.
    /// </param>
    public record UseCouponRequest(Guid? ReferenceId, string? Note, decimal? AppliedDiscount = null);

    /// <summary>
    /// POST /api/rewards/internal/coupon/{code}/use
    /// Consume el cupon y lo ata al viaje donde se aplico. Si llega el
    /// descuento aplicado, devuelve el sobrante del cupón como puntos
    /// (idempotente: reintentar con el mismo viaje no acredita dos veces).
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
            if (body?.ReferenceId is Guid tripId && body.AppliedDiscount is decimal aplicado)
                return Ok(await _mediator.Send(new UseTripCouponCommand(code, tripId, aplicado), ct));

            var dto = await _mediator.Send(
                new UseRedemptionCommand(code, body?.ReferenceId, body?.Note), ct);
            return Ok(dto);
        }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// GET /api/rewards/internal/payout-codes/{code}
    /// Payments consulta un código de cobro (canje BG-... o premio PZ-...):
    /// qué es, de quién, monto y si se puede pagar.
    /// </summary>
    [HttpGet("payout-codes/{code}")]
    public async Task<IActionResult> LookupPayoutCode(
        string code,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;
        try   { return Ok(await _mediator.Send(new LookupPayoutCodeQuery(code), ct)); }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
    }

    public record SettlePayoutCodeRequest(Guid? AdminId, string? Note);

    /// <summary>
    /// POST /api/rewards/internal/payout-codes/{code}/settle
    /// Payments ya registró el pago: el canje queda usado o el premio entregado.
    /// </summary>
    [HttpPost("payout-codes/{code}/settle")]
    public async Task<IActionResult> SettlePayoutCode(
        string code,
        [FromBody] SettlePayoutCodeRequest? body,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;
        try   { return Ok(await _mediator.Send(new SettlePayoutCodeCommand(code, body?.AdminId, body?.Note), ct)); }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    public record NotifyPayoutRequest(
        Guid UserId, decimal Amount, string Method,
        string? OperationNumber, string? SourceType, string? Note);

    /// <summary>
    /// POST /api/rewards/internal/notify/payout
    /// Payments avisa que registro un pago a un conductor: push + correo.
    /// </summary>
    [HttpPost("notify/payout")]
    public async Task<IActionResult> NotifyPayout(
        [FromBody] NotifyPayoutRequest req,
        [FromHeader(Name = "X-Internal-Token")] string? token,
        CancellationToken ct)
    {
        if (!IsInternalTokenValid(token, out var error)) return error!;
        var sent = await _mediator.Send(new NotifyPayoutCommand(
            req.UserId, req.Amount, req.Method, req.OperationNumber, req.SourceType, req.Note), ct);
        return Ok(new { sent });
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

        if (!InternalTokenAttribute.Matches(token, expected))
        {
            _log.LogWarning("Intento de acceso interno con token invalido.");
            error = Unauthorized(new { error = "Token interno invalido." });
            return false;
        }

        error = null;
        return true;
    }
}
