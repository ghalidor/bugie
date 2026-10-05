using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Bugie.Payments.Application.Commands;
using Bugie.Payments.Application.DTOs;

namespace Bugie.Payments.Api.Controllers;

/// <summary>
/// Billetera del conductor: comision que le debe a Bugie.
/// El conductor cobra todo en mano; cada viaje genera una comision (deuda)
/// y el admin registra los pagos de comision que recibe.
/// </summary>
[ApiController]
[Route("api/payments")]
[Authorize]
public class WalletController : ControllerBase
{
    private readonly IMediator _mediator;
    public WalletController(IMediator mediator) => _mediator = mediator;

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// GET /api/payments/wallet/me?page=1&amp;pageSize=20 — billetera del conductor:
    /// ganancia neta, comision generada y pagada, deuda y movimientos.
    /// </summary>
    [HttpGet("wallet/me")]
    [Authorize(Roles = "driver")]
    public async Task<IActionResult> MyWallet(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetDriverWalletQuery(CurrentUserId, page, pageSize), ct));

    /// <summary>
    /// GET /api/payments/admin/wallets?onlyDebt=true&amp;search=&amp;page=1 — billeteras,
    /// de la mayor deuda a la menor, con la deuda total.
    /// </summary>
    [HttpGet("admin/wallets")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewCommissions)]
    public async Task<IActionResult> Wallets(
        [FromQuery] string? search   = null,
        [FromQuery] bool    onlyDebt = true,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 25,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetWalletsQuery(search, onlyDebt, page, pageSize), ct));

    /// <summary>GET /api/payments/admin/wallets/{driverId} — billetera y movimientos de un conductor.</summary>
    [HttpGet("admin/wallets/{driverId:guid}")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewCommissions)]
    public async Task<IActionResult> DriverWallet(
        Guid driverId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetDriverWalletQuery(driverId, page, pageSize), ct));

    /// <summary>POST /api/payments/admin/wallets/commission-payments — registrar un pago de comision recibido.</summary>
    [HttpPost("admin/wallets/commission-payments")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewCommissions)]
    public async Task<IActionResult> RegisterCommissionPayment(
        [FromBody] RegisterCommissionPaymentRequest req, CancellationToken ct)
    {
        var adminName = User.FindFirstValue("fullName");
        try
        {
            return Ok(await _mediator.Send(new RegisterCommissionPaymentCommand(req, CurrentUserId, adminName), ct));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>GET /api/payments/admin/wallets/commission-payments?driverId= — pagos de comision recibidos.</summary>
    [HttpGet("admin/wallets/commission-payments")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewCommissions)]
    public async Task<IActionResult> CommissionPayments(
        [FromQuery] Guid? driverId = null,
        [FromQuery] int   page     = 1,
        [FromQuery] int   pageSize = 25,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetCommissionPaymentsQuery(driverId, page, pageSize), ct));
}
