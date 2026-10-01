using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreatePaymentRequest req, CancellationToken ct) =>
        Ok(await _mediator.Send(
            new CreatePaymentCommand(req.TripId, req.PassengerId, req.DriverId, req.Amount, req.Method), ct));

    [HttpPut("{id:guid}/complete")]
    public async Task<IActionResult> Complete(
        Guid id, [FromBody] string? reference, CancellationToken ct) =>
        Ok(await _mediator.Send(new CompletePaymentCommand(id, reference), ct));

    [HttpGet("earnings")]
    [Authorize(Roles = "driver")]
    public async Task<IActionResult> Earnings(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetDriverEarningsQuery(CurrentUserId), ct));

    [HttpGet("my-payments")]
    public async Task<IActionResult> MyPayments(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetPassengerPaymentsQuery(CurrentUserId), ct));

    // Admin — ver todos los pagos
    [HttpGet]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? status, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetAllPaymentsQuery(status), ct));

    /// <summary>
    /// Admin: lista paginada de pagos.
    /// GET /api/payments/paged?page=1&amp;pageSize=25&amp;status=completed
    /// </summary>
    [HttpGet("paged")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Paged(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? status = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(
            new GetPaymentsPagedQuery(page, pageSize, status), ct));

    /// <summary>
    /// Admin: KPIs agregados de pagos (totales monetarios + cuentas).
    /// GET /api/payments/stats?status=completed
    /// </summary>
    [HttpGet("stats")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> Stats(
        [FromQuery] string? status = null,
        CancellationToken ct = default) =>
        Ok(await _mediator.Send(new GetPaymentsStatsQuery(status), ct));
}
