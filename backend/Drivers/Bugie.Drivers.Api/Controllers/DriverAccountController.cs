using System.Security.Claims;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Bugie.Drivers.Application.Commands;
using Bugie.Drivers.Application.Queries;

namespace Bugie.Drivers.Api.Controllers;

/// <summary>
/// Cuenta del conductor: rechazo, suspensión, reactivación, solicitudes de
/// revisión y línea de tiempo de estados.
/// Errores: 400 motivo/fecha inválidos, 404 conductor no existe,
/// 409 el estado actual no permite la acción. Siempre { error }.
/// </summary>
[ApiController]
[Route("api/drivers")]
[Authorize]
public class DriverAccountController : ControllerBase
{
    private readonly IMediator _mediator;
    public DriverAccountController(IMediator mediator) => _mediator = mediator;

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string? CurrentUserName => User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Email);

    public record ReasonRequest(string? Reason);
    public record SuspendRequest(string? Reason, string? Until);
    public record ReviewRequestBody(string? Message);

    // ── Conductor ────────────────────────────────────────────────────────

    /// <summary>
    /// POST /api/drivers/me/review-request  Body: { "message": "..." } (10-1000).
    /// Solo si está rechazado o suspendido; una abierta a la vez (409).
    /// </summary>
    [HttpPost("me/review-request")]
    public Task<IActionResult> RequestReview([FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ReviewRequestBody? body, CancellationToken ct) =>
        Run(() => _mediator.Send(new RequestDriverReviewCommand(CurrentUserId, body?.Message), ct));

    // ── Admin ────────────────────────────────────────────────────────────

    /// <summary>POST /api/drivers/admin/{driverId}/reject  Body: { "reason": "..." } (10-500).</summary>
    [HttpPost("admin/{driverId:guid}/reject")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewDrivers, Perm.ViewVerification)]
    [RequirePermission(Perm.ActionApproveDriver)]
    public Task<IActionResult> Reject(Guid driverId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ReasonRequest? body, CancellationToken ct) =>
        Run(() => _mediator.Send(new RejectDriverCommand(driverId, body?.Reason, CurrentUserId, CurrentUserName), ct));

    /// <summary>
    /// POST /api/drivers/admin/{driverId}/suspend  Body: { "reason": "...", "until": "yyyy-MM-dd" | null }.
    /// until = último día de la suspensión (hora de Perú); null = indefinida.
    /// </summary>
    [HttpPost("admin/{driverId:guid}/suspend")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewDrivers)]
    public Task<IActionResult> Suspend(Guid driverId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] SuspendRequest? body, CancellationToken ct) =>
        Run(() => _mediator.Send(
            new SuspendDriverCommand(driverId, body?.Reason, body?.Until, CurrentUserId, CurrentUserName), ct));

    /// <summary>POST /api/drivers/admin/{driverId}/reactivate  Body: { "reason": "..." }.</summary>
    [HttpPost("admin/{driverId:guid}/reactivate")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewDrivers)]
    public Task<IActionResult> Reactivate(Guid driverId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ReasonRequest? body, CancellationToken ct) =>
        Run(() => _mediator.Send(new ReactivateDriverCommand(driverId, body?.Reason, CurrentUserId, CurrentUserName), ct));

    /// <summary>
    /// POST /api/drivers/admin/{driverId}/review-request/keep  Body: { "reason": "..." }.
    /// Mantiene el rechazo/suspensión y cierra la solicitud abierta.
    /// </summary>
    [HttpPost("admin/{driverId:guid}/review-request/keep")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewDrivers)]
    public Task<IActionResult> KeepStatus(Guid driverId, [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] ReasonRequest? body, CancellationToken ct) =>
        Run(() => _mediator.Send(new KeepDriverStatusCommand(driverId, body?.Reason, CurrentUserId, CurrentUserName), ct));

    /// <summary>GET /api/drivers/admin/{driverId}/timeline  (más reciente primero).</summary>
    [HttpGet("admin/{driverId:guid}/timeline")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewDrivers, Perm.ViewVerification)]
    public async Task<IActionResult> Timeline(Guid driverId, CancellationToken ct)
    {
        var items = await _mediator.Send(new GetDriverTimelineQuery(driverId), ct);
        return items is null ? NotFound(new { error = "Conductor no encontrado." }) : Ok(items);
    }

    private async Task<IActionResult> Run<T>(Func<Task<T>> action)
    {
        try { return Ok(await action()); }
        catch(KeyNotFoundException ex) { return NotFound(new { error = ex.Message }); }
        catch(ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }
}
