using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Rewards.Application.Commands;
using Bugie.Rewards.Application.DTOs;
using Bugie.Rewards.Application.Queries;

namespace Bugie.Rewards.Api.Controllers;

/// <summary>
/// Configuracion del motor de puntos desde el back office.
/// Todo lo que aqui se cambia toma efecto sin recompilar ni reiniciar.
/// </summary>
[ApiController]
[Route("api/rewards/admin")]
[Authorize(Roles = "admin")]
[RequirePermission(Perm.ViewRewards)]
public class RewardsAdminController : ControllerBase
{
    private readonly IMediator _mediator;
    public RewardsAdminController(IMediator mediator) => _mediator = mediator;

    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    /// <summary>GET /api/rewards/admin/settings</summary>
    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetSettingsQuery(), ct));

    public record UpdateSettingRequest(string Value);

    /// <summary>
    /// PUT /api/rewards/admin/settings/{key}
    /// Claves validas: points_enabled, points_rate_passenger, points_rate_driver,
    /// points_expiry_months_passenger, points_expiry_months_driver, points_level_basis.
    /// </summary>
    [HttpPut("settings/{key}")]
    public async Task<IActionResult> UpdateSetting(
        string key, [FromBody] UpdateSettingRequest body, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new UpdateSettingCommand(key, body.Value, CurrentUserId), ct);
            return Ok(new { message = "Configuracion actualizada." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ────────────────────── CATALOGO DE CANJE ──────────────────────

    /// <summary>GET /api/rewards/admin/catalog?userType=passenger</summary>
    [HttpGet("catalog")]
    public async Task<IActionResult> GetCatalog(
        [FromQuery] string? userType = null, CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetAdminCatalogQuery(userType), ct));

    public record CatalogItemRequest(
        string   Code,
        string   UserType,
        string   Name,
        string?  Description,
        int      PointsCost,
        string   RewardType,
        decimal? AmountSoles,
        int?     Quantity,
        decimal? Percentage,
        string?  MinLevel,
        int?     Stock,
        int      ValidityDays,
        short    SortOrder,
        bool     IsActive);

    /// <summary>POST /api/rewards/admin/catalog — crea una recompensa.</summary>
    [HttpPost("catalog")]
    public Task<IActionResult> CreateCatalogItem(
        [FromBody] CatalogItemRequest body, CancellationToken ct) =>
        UpsertCatalogItem(null, body, ct);

    /// <summary>PUT /api/rewards/admin/catalog/{id} — edita una recompensa.</summary>
    [HttpPut("catalog/{id:guid}")]
    public Task<IActionResult> UpdateCatalogItem(
        Guid id, [FromBody] CatalogItemRequest body, CancellationToken ct) =>
        UpsertCatalogItem(id, body, ct);

    private async Task<IActionResult> UpsertCatalogItem(
        Guid? id, CatalogItemRequest b, CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(new UpsertCatalogItemCommand(
                id, b.Code, b.UserType, b.Name, b.Description, b.PointsCost,
                b.RewardType, b.AmountSoles, b.Quantity, b.Percentage,
                b.MinLevel, b.Stock, b.ValidityDays, b.SortOrder, b.IsActive), ct);
            return Ok(dto);
        }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch (ArgumentException ex)    { return BadRequest(new { error = ex.Message }); }
    }

    // ────────────────────────── CANJES ──────────────────────────

    /// <summary>
    /// GET /api/rewards/admin/redemptions?status=active&amp;userType=driver
    /// Auditoria de canjes. Aqui se ven los premios pendientes de entregar.
    /// </summary>
    [HttpGet("redemptions")]
    public async Task<IActionResult> GetRedemptions(
        [FromQuery] string? status = null,
        [FromQuery] string? userType = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetAllRedemptionsQuery(status, userType, page, pageSize), ct));

    public record MarkUsedRequest(string? Note);

    /// <summary>
    /// PUT /api/rewards/admin/redemptions/{code}/use
    /// Marca el cupon como entregado. Es lo que se usa para bonos y premios
    /// fisicos, que se entregan fuera de la app.
    /// </summary>
    [HttpPut("redemptions/{code}/use")]
    public async Task<IActionResult> MarkUsed(
        string code, [FromBody] MarkUsedRequest? body, CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(
                new UseRedemptionCommand(code, null, body?.Note ?? "Entregado por el administrador."), ct);
            return Ok(dto);
        }
        catch (KeyNotFoundException ex)    { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// PUT /api/rewards/admin/redemptions/{code}/cancel
    /// Anula el cupon y devuelve los puntos al usuario.
    /// </summary>
    [HttpPut("redemptions/{code}/cancel")]
    public async Task<IActionResult> CancelRedemption(
        string code, [FromBody] MarkUsedRequest? body, CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(
                new CancelRedemptionCommand(code, body?.Note), ct);
            return Ok(dto);
        }
        catch (KeyNotFoundException ex)    { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// POST /api/rewards/admin/expiration/run
    /// Dispara una pasada de vencimiento a mano, sin esperar al job.
    /// Sirve para probar y para forzar la limpieza cuando haga falta.
    /// </summary>
    [HttpPost("expiration/run")]
    public async Task<IActionResult> RunExpiration(
        [FromQuery] int batchSize = 200, CancellationToken ct = default)
    {
        var result = await _mediator.Send(
            new RunPointsExpirationCommand(Math.Clamp(batchSize, 1, 1000)), ct);
        return Ok(result);
    }

    // ────────────────────────── PROMOCIONES ──────────────────────────

    /// <summary>
    /// GET /api/rewards/admin/promotions
    /// Todas, con cuántas veces aplicó cada una y cuántos puntos regaló.
    /// </summary>
    [HttpGet("promotions")]
    public async Task<IActionResult> GetPromotions(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetPromotionsQuery(), ct));

    /// <summary>POST /api/rewards/admin/promotions</summary>
    [HttpPost("promotions")]
    public Task<IActionResult> CreatePromotion(
        [FromBody] PromotionInput body, CancellationToken ct) =>
        UpsertPromotion(null, body, ct);

    /// <summary>PUT /api/rewards/admin/promotions/{id}</summary>
    [HttpPut("promotions/{id:guid}")]
    public Task<IActionResult> UpdatePromotion(
        Guid id, [FromBody] PromotionInput body, CancellationToken ct) =>
        UpsertPromotion(id, body, ct);

    private async Task<IActionResult> UpsertPromotion(
        Guid? id, PromotionInput body, CancellationToken ct)
    {
        try
        {
            return Ok(await _mediator.Send(new UpsertPromotionCommand(id, body), ct));
        }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch (ArgumentException ex)    { return BadRequest(new { error = ex.Message }); }
    }

    public record SetActiveRequest(bool IsActive);

    /// <summary>
    /// PUT /api/rewards/admin/promotions/{id}/active
    /// Prende o apaga una promoción sin tocar el resto de su configuración.
    /// </summary>
    [HttpPut("promotions/{id:guid}/active")]
    public async Task<IActionResult> SetPromotionActive(
        Guid id, [FromBody] SetActiveRequest body, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new SetPromotionActiveCommand(id, body.IsActive), ct);
            return Ok(new { message = body.IsActive ? "Promoción activada." : "Promoción desactivada." });
        }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
    }

    /// <summary>DELETE /api/rewards/admin/promotions/{id}</summary>
    [HttpDelete("promotions/{id:guid}")]
    public async Task<IActionResult> DeletePromotion(Guid id, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new DeletePromotionCommand(id), ct);
            return Ok(new { message = "Promoción eliminada." });
        }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
    }

    // ─────────────────────── SOPORTE DE USUARIOS ───────────────────────

    /// <summary>
    /// GET /api/rewards/admin/users?q=texto
    /// Busca por correo, nombre o teléfono. Incluye usuarios SIN perfil de
    /// puntos: si alguien reclama que no le acreditaron nada, es justamente
    /// el caso que hay que poder encontrar.
    /// </summary>
    [HttpGet("users")]
    public async Task<IActionResult> SearchUsers(
        [FromQuery] string q, CancellationToken ct) =>
        Ok(await _mediator.Send(new SearchUsersQuery(q ?? string.Empty), ct));

    /// <summary>
    /// GET /api/rewards/admin/users/{userId}
    /// Saldo, historial, canjes, referidos y logros de una persona.
    /// </summary>
    [HttpGet("users/{userId:guid}")]
    public async Task<IActionResult> GetUser(Guid userId, CancellationToken ct)
    {
        try   { return Ok(await _mediator.Send(new GetUserRewardsQuery(userId), ct)); }
        catch (KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
    }

    public record AdjustRequest(int Points, string Reason);

    /// <summary>
    /// POST /api/rewards/admin/users/{userId}/adjust
    /// Corrige los puntos. Positivo suma, negativo resta. El motivo es
    /// obligatorio y queda registrado junto con el administrador que lo hizo.
    /// </summary>
    [HttpPost("users/{userId:guid}/adjust")]
    public async Task<IActionResult> AdjustPoints(
        Guid userId, [FromBody] AdjustRequest body, CancellationToken ct)
    {
        try
        {
            return Ok(await _mediator.Send(new AdjustUserPointsCommand(
                userId, body.Points, body.Reason, CurrentUserId), ct));
        }
        catch (ArgumentException ex)         { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// POST /api/rewards/admin/no-cancellations/run?date=2026-10-08
    /// Paga el bono de trabajar sin cancelar. Corre solo cada madrugada para
    /// el día anterior; esto es para probarlo sin esperar.
    /// </summary>
    [HttpPost("no-cancellations/run")]
    public async Task<IActionResult> RunNoCancellations(
        [FromQuery] DateTime? date, CancellationToken ct) =>
        Ok(await _mediator.Send(new AwardNoCancellationsCommand(date), ct));

    // ────────────────────────── BALANCE ──────────────────────────

    /// <summary>
    /// GET /api/rewards/admin/balance
    /// Cuánto se emitió, cuánto se canjeó y cuánto se debe.
    /// </summary>
    [HttpGet("balance")]
    public async Task<IActionResult> Balance(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetProgramBalanceQuery(), ct));

    /// <summary>
    /// GET /api/rewards/admin/coupon-usage
    /// Viajes a los que se les aplicó un cupón, cuánto se descontó y cuánto
    /// se le quedó debiendo al conductor.
    /// </summary>
    [HttpGet("coupon-usage")]
    public async Task<IActionResult> CouponUsage(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetCouponUsageQuery(), ct));

    // ────────────────────────── REFERIDOS ──────────────────────────

    /// <summary>
    /// GET /api/rewards/admin/referrals
    /// Cómo va el programa: cuántos referidos hay, cuántos ya completaron sus
    /// viajes, cuántos puntos se regalaron y quiénes más invitaron.
    /// </summary>
    [HttpGet("referrals")]
    public async Task<IActionResult> ReferralStats(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetReferralStatsQuery(), ct));

    // ─────────────────────────── SORTEOS ───────────────────────────

    /// <summary>GET /api/rewards/admin/raffles — todos, con sus ganadores.</summary>
    [HttpGet("raffles")]
    public async Task<IActionResult> GetRaffles(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetRafflesQuery(), ct));

    /// <summary>POST /api/rewards/admin/raffles</summary>
    [HttpPost("raffles")]
    public Task<IActionResult> CreateRaffle([FromBody] RaffleInput body, CancellationToken ct) =>
        UpsertRaffle(null, body, ct);

    /// <summary>PUT /api/rewards/admin/raffles/{id}</summary>
    [HttpPut("raffles/{id:guid}")]
    public Task<IActionResult> UpdateRaffle(
        Guid id, [FromBody] RaffleInput body, CancellationToken ct) =>
        UpsertRaffle(id, body, ct);

    private async Task<IActionResult> UpsertRaffle(
        Guid? id, RaffleInput body, CancellationToken ct)
    {
        try   { return Ok(await _mediator.Send(new UpsertRaffleCommand(id, body), ct)); }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        catch (ArgumentException ex)         { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>DELETE /api/rewards/admin/raffles/{id}</summary>
    [HttpDelete("raffles/{id:guid}")]
    public async Task<IActionResult> DeleteRaffle(Guid id, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new DeleteRaffleCommand(id), ct);
            return Ok(new { message = "Sorteo eliminado." });
        }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// POST /api/rewards/admin/raffles/{id}/draw
    /// Ejecuta el sorteo ahora, sin esperar a su fecha.
    /// </summary>
    [HttpPost("raffles/{id:guid}/draw")]
    public async Task<IActionResult> DrawRaffle(Guid id, CancellationToken ct)
    {
        try   { return Ok(await _mediator.Send(new DrawRaffleNowCommand(id), ct)); }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// GET /api/rewards/admin/raffles/{id}/verify
    /// Repite el cálculo del sorteo con la semilla guardada y compara con el
    /// ganador registrado. Sirve para demostrar que no se eligió a dedo.
    /// </summary>
    [HttpGet("raffles/{id:guid}/verify")]
    public async Task<IActionResult> VerifyRaffle(Guid id, CancellationToken ct)
    {
        try   { return Ok(await _mediator.Send(new VerifyRaffleCommand(id), ct)); }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    public record DeliverPrizeRequest(string? Note);

    /// <summary>PUT /api/rewards/admin/raffles/winners/{winnerId}/deliver</summary>
    [HttpPut("raffles/winners/{winnerId:guid}/deliver")]
    public async Task<IActionResult> DeliverPrize(
        Guid winnerId, [FromBody] DeliverPrizeRequest? body, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new DeliverPrizeCommand(winnerId, CurrentUserId, body?.Note), ct);
            return Ok(new { message = "Premio marcado como entregado." });
        }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// POST /api/rewards/admin/raffles/maintenance
    /// Reparte los tickets pendientes y ejecuta los sorteos vencidos.
    /// Corre solo cada día; esto es para probarlo sin esperar.
    /// </summary>
    [HttpPost("raffles/maintenance")]
    public async Task<IActionResult> RunRaffleMaintenance(
        [FromQuery] bool draw = true, CancellationToken ct = default) =>
        Ok(await _mediator.Send(new RunRaffleMaintenanceCommand(draw), ct));

    /// <summary>GET /api/rewards/admin/levels?userType=passenger</summary>
    [HttpGet("levels")]
    public async Task<IActionResult> GetLevels(
        [FromQuery] string? userType = null, CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetLevelsQuery(userType), ct));

    public record UpdateLevelRequest(
        string  DisplayName,
        int     MinPoints,
        int?    MaxPoints,
        decimal DiscountPercentage,
        int     MonthlyFreeTrips,
        int     WeeklyRaffleTickets,
        int     MonthlyRaffleTickets,
        bool    IsActive,
        int?     MonthlyDiscountCoupons = null,
        decimal? FreeTripMaxAmount      = null);

    /// <summary>
    /// PUT /api/rewards/admin/levels/{id}
    /// Cambia umbrales y beneficios de un nivel.
    /// Beneficios con cupones (solo pasajero):
    ///   - monthlyDiscountCoupons: cupones de discountPercentage que puede
    ///     reclamar al mes (>= 0). Si no se envía, se conserva.
    ///   - freeTripMaxAmount: tope en soles de cada viaje gratis (> 0).
    ///     Obligatorio si monthlyFreeTrips > 0 (si no se envía, se conserva el
    ///     actual); con monthlyFreeTrips = 0 y null queda sin tope.
    /// </summary>
    [HttpPut("levels/{id:guid}")]
    public async Task<IActionResult> UpdateLevel(
        Guid id, [FromBody] UpdateLevelRequest body, CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(new UpdateLevelCommand(
                id, body.DisplayName, body.MinPoints, body.MaxPoints,
                body.DiscountPercentage, body.MonthlyFreeTrips,
                body.WeeklyRaffleTickets, body.MonthlyRaffleTickets, body.IsActive,
                body.MonthlyDiscountCoupons, body.FreeTripMaxAmount), ct);
            return Ok(dto);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
