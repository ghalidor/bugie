using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoints para rechazar/declinar propuestas y enviar contrapropuestas.
/// El pasajero es siempre quien inicia el viaje (vía /accept-proposal).
/// El conductor solo Propone, Contrapropone o Declina.
/// </summary>
[ApiController]
[Route("api/trips")]
[Authorize]
public class ProposalsActionsController : ControllerBase
{
    private readonly ITripRepository _trips;
    private readonly ITripProposalRepository _proposals;
    private readonly ITripNotificationService _notify;
    private readonly IDriversClient _drivers;

    public ProposalsActionsController(
        ITripRepository trips,
        ITripProposalRepository proposals,
        ITripNotificationService notify,
        IDriversClient drivers)
    {
        _trips = trips;
        _proposals = proposals;
        _notify = notify;
        _drivers = drivers;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// PUT /api/trips/{tripId}/proposals/{proposalId}/reject
    /// El pasajero rechaza UNA propuesta del conductor. Graba RejectedBy='passenger'.
    /// </summary>
    [HttpPut("{tripId:guid}/proposals/{proposalId:guid}/reject")]
    public async Task<IActionResult> RejectProposal(
        Guid tripId, Guid proposalId, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });

        if(trip.PassengerId != CurrentUserId)
            return Forbid();

        var proposal = await _proposals.GetByIdAsync(proposalId, ct);
        if(proposal is null) return NotFound(new { error = "Propuesta no encontrada." });

        if(proposal.TripId != tripId)
            return BadRequest(new { error = "La propuesta no pertenece a este viaje." });

        if(proposal.Status != "pending")
            return BadRequest(new { error = "Solo se pueden rechazar propuestas pendientes." });

        await _proposals.UpdateStatusAsync(proposalId, "rejected", "passenger", ct);

        // Notificar al conductor que su propuesta fue rechazada.
        _ = _notify.NotifyDriverProposalRejectedAsync(proposal.DriverId, tripId, trip.ServiceType);

        return Ok(new { message = "Propuesta rechazada." });
    }

    /// <summary>
    /// PUT /api/trips/{tripId}/proposals/reject-all
    /// El pasajero rechaza TODAS las propuestas pending del viaje.
    /// Cada conductor verá el feedback "el pasajero rechazó tu propuesta".
    /// </summary>
    [HttpPut("{tripId:guid}/proposals/reject-all")]
    public async Task<IActionResult> RejectAll(Guid tripId, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });

        if(trip.PassengerId != CurrentUserId)
            return Forbid();

        var affected = await _proposals.RejectAllByPassengerAsync(tripId, ct);

        return Ok(new { message = "Todas las propuestas rechazadas.", affected });
    }

    /// <summary>
    /// POST /api/trips/{tripId}/counter
    /// El pasajero envía una contrapropuesta hacia un conductor específico.
    /// </summary>
    [HttpPost("{tripId:guid}/counter")]
    public async Task<IActionResult> CounterPropose(
        Guid tripId,
        [FromBody] CounterRequest req,
        CancellationToken ct)
    {
        if(req is null || req.Fare <= 0)
            return BadRequest(new { error = "Ingresa un monto válido." });

        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });

        if(trip.PassengerId != CurrentUserId)
            return Forbid();

        if(trip.Status != TripStatus.Pending && trip.Status != TripStatus.Negotiating)
            return BadRequest(new { error = "Este viaje ya no está disponible para negociar." });

        await _proposals.SupersedePendingAsync(tripId, req.DriverId, ct);

        var counter = TripProposal.CreateCounter(tripId, req.DriverId, req.Fare);
        await _proposals.AddAsync(counter, ct);

        // Notificar al conductor que recibió una contrapropuesta del pasajero.
        _ = _notify.NotifyDriverPassengerCounterAsync(req.DriverId, tripId, req.Fare, trip.ServiceType);

        return Ok(new
        {
            message = "Contrapropuesta enviada.",
            proposalId = counter.Id,
        });
    }

    /// <summary>
    /// PUT /api/trips/{tripId}/decline-by-driver
    /// El CONDUCTOR declina el viaje completo. Marca como 'rejected' todas las
    /// propuestas pending entre él y este viaje (incluyendo contrapropuestas del
    /// pasajero hacia él). El pasajero verá el feedback "Conductor declinó".
    /// </summary>
    [HttpPut("{tripId:guid}/decline-by-driver")]
    public async Task<IActionResult> DeclineByDriver(Guid tripId, CancellationToken ct)
    {
        // Solo un conductor aprobado (403 si no es conductor, 409 si no está aprobado).
        var denied = await Bugie.Trips.Api.Security.DriverAccess.EnsureApprovedDriverAsync(
            this, _drivers, CurrentUserId, ct);
        if(denied is not null) return denied;

        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });

        // Solo si el conductor negoció este viaje (tiene propuestas) o si la
        // solicitud sigue abierta (es la que ve en su lista).
        var hasProposal = (await _proposals.GetByTripAsync(tripId, ct))
            .Any(p => p.DriverId == CurrentUserId);
        var isOpen = trip.Status == TripStatus.Pending || trip.Status == TripStatus.Negotiating;
        if(!hasProposal && !isOpen)
            return Conflict(new { error = "Este viaje ya no está disponible." });

        var affected = await _proposals.RejectAllBetweenAsync(tripId, CurrentUserId, ct);

        // Notificar al pasajero que el conductor declinó el viaje, solo si de
        // verdad había negociación con él (si no, el pasajero no sabe de él).
        if(affected > 0)
            _ = _notify.NotifyTripCancelledAsync(trip.PassengerId, tripId, "driver", null, trip.ServiceType);

        return Ok(new
        {
            message = "Viaje declinado.",
            affected,
        });
    }
}

public record CounterRequest(Guid DriverId, decimal Fare);