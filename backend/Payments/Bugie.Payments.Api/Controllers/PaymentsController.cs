using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using System.Security.Claims;
using Bugie.Payments.Application.Commands;
using Bugie.Payments.Application.DTOs;
using Bugie.Payments.Application.Queries;

namespace Bugie.Payments.Api.Controllers;

[ApiController]
[Route("api/payments")]
[Authorize]
public class PaymentsController : ControllerBase {
    private readonly IMediator _mediator;
    public PaymentsController(IMediator mediator) => _mediator = mediator;

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// POST /api/payments — pago de un viaje completado. Lo llama Trips al
    /// completar, reenviando el token del conductor. Solo puede crearlo el
    /// conductor del viaje (o un admin); el handler valida contra el viaje.
    /// </summary>
    [HttpPost]
    [RequirePermission(Perm.ViewPayments, SkipForNonAdmins = true)]
    public async Task<IActionResult> Create(
        [FromBody] CreatePaymentRequest req, CancellationToken ct)
    {
        if (!User.IsInRole("admin") && req.DriverId != CurrentUserId) return Forbid();
        try
        {
            return Ok(await _mediator.Send(
                new CreatePaymentCommand(req.TripId, req.PassengerId, req.DriverId, req.Amount, req.Method), ct));
        }
        catch (UnauthorizedAccessException) { return Forbid(); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpGet("earnings")]
    [Authorize(Roles = "driver")]
    public async Task<IActionResult> Earnings(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetDriverEarningsQuery(CurrentUserId), ct));

    /// <summary>
    /// GET /api/payments/payouts/me — pagos que Bugie le hizo al conductor
    /// (bonos canjeados, premios de sorteo, pagos manuales) con su total.
    /// </summary>
    [HttpGet("payouts/me")]
    [Authorize(Roles = "driver")]
    public async Task<IActionResult> MyPayouts(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetPayoutsQuery(CurrentUserId, null, null, null, null, null, page, pageSize), ct));

    [HttpGet("my-payments")]
    public async Task<IActionResult> MyPayments(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetPassengerPaymentsQuery(CurrentUserId), ct));

    /// <summary>
    /// Admin: lista paginada de pagos.
    /// GET /api/payments/paged?page=1&amp;pageSize=25&amp;status=completed&amp;search=&amp;method=yape&amp;from=2026-10-01&amp;to=2026-10-31
    /// search: nombre, correo o documento del pasajero o del conductor, referencia o Id del viaje.
    /// from / to: dias de Peru (yyyy-MM-dd), ambos incluidos.
    /// </summary>
    [HttpGet("paged")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewPayments)]
    public async Task<IActionResult> Paged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? status = null,
        [FromQuery] string? search = null,
        [FromQuery] string? method = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetPaymentsPagedQuery(page, pageSize, status, search, method, from, to), ct));

    /// <summary>
    /// Admin: KPIs agregados de pagos (totales monetarios + cuentas).
    /// GET /api/payments/stats?status=completed&amp;search=&amp;method=&amp;from=&amp;to=
    /// Mismos filtros que /paged.
    /// </summary>
    [HttpGet("stats")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewPayments)]
    public async Task<IActionResult> Stats(
        [FromQuery] string? status = null,
        [FromQuery] string? search = null,
        [FromQuery] string? method = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetPaymentsStatsQuery(status, search, method, from, to), ct));
}
