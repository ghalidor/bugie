using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Rewards.Application.Commands;
using Bugie.Rewards.Application.Queries;
using Bugie.Rewards.Domain.Constants;

namespace Bugie.Rewards.Api.Controllers;

/// <summary>
/// Endpoints del usuario final (pasajero o conductor).
/// Todos son de solo lectura: los puntos se acreditan por evento, nunca a pedido.
/// </summary>
[ApiController]
[Route("api/rewards")]
[Authorize]
public class RewardsController : ControllerBase
{
    private readonly IMediator _mediator;
    public RewardsController(IMediator mediator) => _mediator = mediator;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>Nombre del token. Se usa para el prefijo del código de invitación.</summary>
    private string? CurrentUserName =>
        User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("fullName");

    private string CurrentUserType =>
        User.IsInRole("driver") ? UserTypes.Driver : UserTypes.Passenger;

    /// <summary>
    /// GET /api/rewards/me
    /// Saldo, nivel actual, siguiente nivel y progreso.
    /// </summary>
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct) =>
        Ok(await _mediator.Send(
            new GetMyPointsProfileQuery(CurrentUserId, CurrentUserType), ct));

    /// <summary>
    /// GET /api/rewards/me/history?page=1&amp;pageSize=20
    /// Historial de movimientos de puntos.
    /// </summary>
    [HttpGet("me/history")]
    public async Task<IActionResult> History(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetMyPointsHistoryQuery(CurrentUserId, page, pageSize), ct));

    // ────────────────────────── CANJE ──────────────────────────

    /// <summary>
    /// GET /api/rewards/catalog
    /// Recompensas disponibles para el usuario, con su saldo ya comparado:
    /// cada item dice si puede canjearlo y, si no, cuantos puntos le faltan.
    /// </summary>
    [HttpGet("catalog")]
    public async Task<IActionResult> Catalog(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetCatalogQuery(CurrentUserId, CurrentUserType), ct));

    public record RedeemRequest(Guid CatalogItemId);

    /// <summary>
    /// POST /api/rewards/redeem
    /// Canjea puntos por una recompensa. Devuelve el cupon generado.
    /// </summary>
    [HttpPost("redeem")]
    public async Task<IActionResult> Redeem(
        [FromBody] RedeemRequest req, CancellationToken ct)
    {
        try
        {
            var result = await _mediator.Send(
                new RedeemRewardCommand(CurrentUserId, CurrentUserType, req.CatalogItemId), ct);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            // Saldo insuficiente, nivel insuficiente, agotado, canje apagado.
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/rewards/me/redemptions?status=active
    /// Cupones del usuario. status: active | used | expired | cancelled.
    /// </summary>
    [HttpGet("me/redemptions")]
    public async Task<IActionResult> MyRedemptions(
        [FromQuery] string? status = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetMyRedemptionsQuery(CurrentUserId, status, page, pageSize), ct));

    /// <summary>
    /// GET /api/rewards/me/progress
    /// Cómo voy con mis logros EN CURSO: racha, meta semanal y aniversario.
    /// A diferencia del historial, esto dice lo que falta, no lo ya ganado.
    /// </summary>
    [HttpGet("me/progress")]
    public async Task<IActionResult> MyProgress(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetMyProgressQuery(CurrentUserId), ct));

    /// <summary>
    /// GET /api/rewards/me/ranking
    /// Ranking entre amigos: yo contra quienes invité y quien me invitó,
    /// por puntos del mes.
    /// </summary>
    [HttpGet("me/ranking")]
    public async Task<IActionResult> MyRanking(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetFriendsRankingQuery(CurrentUserId), ct));

    /// <summary>
    /// GET /api/rewards/me/referral
    /// Mi código de invitación y cómo me va: a cuántos invité, cuántos ya
    /// completaron sus viajes y qué gané. El código se crea la primera vez
    /// que se pide, no al registrarse.
    /// </summary>
    [HttpGet("me/referral")]
    public async Task<IActionResult> MyReferral(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetMyReferralCommand(CurrentUserId, CurrentUserName), ct));

    public record InviteRequest(string Email);

    /// <summary>
    /// POST /api/rewards/me/referral/invite
    /// Manda mi código por correo. Hay un tope diario para que esto no se use
    /// como enviador de correo masivo.
    /// </summary>
    [HttpPost("me/referral/invite")]
    public async Task<IActionResult> Invite(
        [FromBody] InviteRequest body, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(
                new InviteByEmailCommand(CurrentUserId, CurrentUserName, body.Email), ct);
            return Ok(new { message = "Invitación enviada." });
        }
        catch (ArgumentException ex)         { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// GET /api/rewards/promotions
    /// Promociones vigentes para mi tipo de cuenta, ya redactadas: qué gano y
    /// cuándo aplica. Las que están activas en este momento vienen primero.
    /// </summary>
    [HttpGet("promotions")]
    public async Task<IActionResult> ActivePromotions(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetActivePromotionsQuery(CurrentUserType), ct));

    /// <summary>
    /// GET /api/rewards/raffles
    /// Sorteos abiertos y los que ya se sortearon donde tuve tickets. Cada uno
    /// dice cuántos tickets tengo y, si no puedo participar, por qué.
    /// </summary>
    [HttpGet("raffles")]
    public async Task<IActionResult> Raffles(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetUserRafflesQuery(CurrentUserId, CurrentUserType), ct));

    public record UseTicketCouponRequest(Guid? RedemptionId);

    /// <summary>
    /// POST /api/rewards/raffles/{raffleId}/use-ticket-coupon
    /// Usa un cupón de ticket de sorteo (canjeado en el catálogo) en este
    /// sorteo: crea los tickets (tantos como diga el cupón) y marca el cupón
    /// como usado. Body: { "redemptionId": "..." }; si se omite, usa el cupón
    /// de ticket que vence primero. El sorteo debe estar abierto y el usuario
    /// cumplir sus requisitos (tipo de cuenta, nivel, antigüedad).
    /// </summary>
    [HttpPost("raffles/{raffleId:guid}/use-ticket-coupon")]
    public async Task<IActionResult> UseTicketCoupon(
        Guid raffleId, [FromBody] UseTicketCouponRequest? body, CancellationToken ct)
    {
        try
        {
            return Ok(await _mediator.Send(new UseRaffleTicketCouponCommand(
                CurrentUserId, CurrentUserType, raffleId, body?.RedemptionId), ct));
        }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// GET /api/rewards/me/level-benefits
    /// Beneficios de mi nivel en el mes (solo pasajero): cupones de descuento
    /// y viajes gratis del mes (total, usados, disponibles), tope del viaje
    /// gratis, fin de mes y si los cupones se aplican a la tarifa.
    /// </summary>
    [HttpGet("me/level-benefits")]
    public async Task<IActionResult> MyLevelBenefits(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetMyLevelBenefitsQuery(CurrentUserId, CurrentUserType), ct));

    public record ClaimLevelBenefitRequest(string Type);

    /// <summary>
    /// POST /api/rewards/me/level-benefits/claim
    /// Reclama un cupón de mi nivel (solo pasajero). Body: { "type": "discount" | "free_trip" }.
    /// No cuesta puntos; el cupón (código BG-) vence al terminar el mes y
    /// aparece en Mis cupones. Lo no reclamado en el mes no se acumula.
    /// </summary>
    [HttpPost("me/level-benefits/claim")]
    public async Task<IActionResult> ClaimLevelBenefit(
        [FromBody] ClaimLevelBenefitRequest body, CancellationToken ct)
    {
        try
        {
            return Ok(await _mediator.Send(
                new ClaimLevelBenefitCommand(CurrentUserId, CurrentUserType, body?.Type ?? ""), ct));
        }
        catch (ArgumentException ex)         { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// GET /api/rewards/levels
    /// Catalogo de niveles para el tipo de usuario logueado.
    /// Sirve para dibujar la barra de progreso en la app.
    /// </summary>
    [HttpGet("levels")]
    public async Task<IActionResult> Levels(
        [FromQuery] string? userType = null, CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetLevelsQuery(userType ?? CurrentUserType), ct));
}
