using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Payments.Application.Commands;
using Bugie.Payments.Application.DTOs;

namespace Bugie.Payments.Api.Controllers;

/// <summary>
/// Pagos a conductores: el admin registra lo que ya pago (bono canjeado,
/// premio de sorteo o pago manual) con metodo, n. de operacion y fecha.
/// </summary>
[ApiController]
[Route("api/payments/admin/payouts")]
[Authorize(Roles = "admin")]
// Pagos a conductores y, desde Fidelizacion, el pago de premios/canjes.
[RequirePermission(Perm.ViewDriverPayouts, Perm.ViewRewards)]
public class PayoutsController : ControllerBase
{
    private readonly IMediator _mediator;
    public PayoutsController(IMediator mediator) => _mediator = mediator;

    /// <summary>POST /api/payments/admin/payouts — registrar un pago hecho.</summary>
    [HttpPost]
    public async Task<IActionResult> Register([FromBody] RegisterPayoutRequest req, CancellationToken ct)
    {
        var adminId   = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var adminName = User.FindFirstValue("fullName");
        try
        {
            return Ok(await _mediator.Send(new RegisterPayoutCommand(req, adminId, adminName), ct));
        }
        catch (PayoutAlreadyRegisteredException ex) { return Conflict(new { error = ex.Message }); }
        catch (InvalidOperationException ex)        { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// GET /api/payments/admin/payouts/code/{code} — que hay detras del codigo que trae
    /// el conductor (canje BG-... o premio PZ-...): de quien es, monto y si se puede pagar.
    /// </summary>
    [HttpGet("code/{code}")]
    public async Task<IActionResult> LookupCode(string code, CancellationToken ct)
    {
        try { return Ok(await _mediator.Send(new GetPayoutCodeQuery(code), ct)); }
        catch (KeyNotFoundException ex)      { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return StatusCode(502, new { error = ex.Message }); }
    }

    /// <summary>
    /// POST /api/payments/admin/payouts/code/{code}/pay — registra el pago de ese codigo
    /// y lo marca como pagado. El mismo codigo no se puede pagar dos veces (409).
    /// </summary>
    [HttpPost("code/{code}/pay")]
    public async Task<IActionResult> PayCode(string code, [FromBody] PayByCodeRequest req, CancellationToken ct)
    {
        var adminId   = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var adminName = User.FindFirstValue("fullName");
        try
        {
            return Ok(await _mediator.Send(new PayByCodeCommand(code, req, adminId, adminName), ct));
        }
        catch (PayoutAlreadyRegisteredException ex) { return Conflict(new { error = ex.Message }); }
        catch (InvalidOperationException ex)        { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// GET /api/payments/admin/payouts?driverId=&amp;from=2026-10-01&amp;to=2026-10-31&amp;method=yape&amp;sourceType=&amp;search=
    /// Reporte paginado con totales del filtro. from/to son dias de Peru.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid?     driverId   = null,
        [FromQuery] DateTime? from       = null,
        [FromQuery] DateTime? to         = null,
        [FromQuery] string?   method     = null,
        [FromQuery] string?   sourceType = null,
        [FromQuery] string?   search     = null,
        [FromQuery] int       page       = 1,
        [FromQuery] int       pageSize   = 25,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetPayoutsQuery(driverId, from, to, method, sourceType, search, page, pageSize), ct));
}
