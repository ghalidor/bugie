using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using System.Security.Claims;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoints de alertas SOS. Este controller es el ÚNICO punto de entrada
/// para todo lo relacionado a alertas de pánico — los endpoints duplicados
/// que antes existían en TripsController fueron removidos.
///
/// Rutas:
///   POST /api/sos                    — pasajero/conductor activa SOS
///   GET  /api/sos                    — admin lista alertas activas
///   PUT  /api/sos/{alertId}/resolve  — admin desactiva con motivo obligatorio
/// </summary>
[ApiController]
[Route("api/sos")]
[Authorize]
public class SosController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly ISosRepository _sos;

    public SosController(IMediator mediator, ISosRepository sos)
        => (_mediator, _sos) = (mediator, sos);

    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// Pasajero o conductor activa SOS. Devuelve el ID del alert creado.
    /// El admin se notifica vía SignalR (broadcast 'sos:new') de forma instantánea.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Activate(
        [FromBody] SosRequest req, CancellationToken ct)
    {
        var userRole = User.FindFirstValue(ClaimTypes.Role)!;
        try
        {
            // El handler exige que sea el pasajero o el conductor de ESE viaje
            // (403) y que el viaje este activo: aceptado o en curso (409).
            var alertId = await _mediator.Send(
                new ActivateSosCommand(req.TripId, CurrentUserId, userRole, req.Lat, req.Lng), ct);
            return Ok(new { alertId, message = "Alerta SOS activada. Monitoreo notificado." });
        }
        catch(KeyNotFoundException) { return NotFound(new { error = "Viaje no encontrado." }); }
        catch(UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
    }

    /// <summary>
    /// Admin lista todas las alertas activas (no resueltas).
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewSosCenter, Perm.ViewLiveMap)]
    public async Task<IActionResult> GetActive(CancellationToken ct)
    {
        var alerts = await _sos.GetActiveAsync(ct);
        return Ok(alerts);
    }

    /// <summary>
    /// Admin desactiva una alerta SOS. El motivo es obligatorio (queda
    /// registrado en BD para auditoría). Si la alerta ya está resuelta,
    /// devuelve 409 Conflict.
    /// </summary>
    [HttpPut("{alertId:guid}/resolve")]
    [Authorize(Roles = "admin")]
    [RequirePermission(Perm.ViewSosCenter, Perm.ViewLiveMap)]
    public async Task<IActionResult> Resolve(
        Guid alertId,
        [FromBody] ResolveSosRequest req,
        CancellationToken ct)
    {
        if(string.IsNullOrWhiteSpace(req?.Reason))
            return BadRequest(new { error = "El motivo es obligatorio." });

        try
        {
            await _mediator.Send(
                new ResolveSosCommand(alertId, CurrentUserId, req.Reason), ct);
            return Ok(new { resolved = true });
        }
        catch(KeyNotFoundException) { return NotFound(new { error = "Alerta no encontrada." }); }
        catch(InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
        catch(ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
    }
}
