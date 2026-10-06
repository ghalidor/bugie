using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Domain.Common;
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
    private readonly ILandingClient _landing;
    // Tiempo real a pasajero y conductor (hub /hubs/trips). Fire-and-forget, nunca lanza.
    private readonly ITripRealtimeNotifier _realtime;

    public ProposalsActionsController(
        ITripRepository trips,
        ITripProposalRepository proposals,
        ITripNotificationService notify,
        IDriversClient drivers,
        ILandingClient landing,
        ITripRealtimeNotifier realtime)
    {
        _trips = trips;
        _proposals = proposals;
        _notify = notify;
        _drivers = drivers;
        _landing = landing;
        _realtime = realtime;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// PUT /api/trips/{tripId}/proposals/{proposalId}/reject
    /// El pasajero rechaza UNA propuesta del conductor (pending o su aceptación a
    /// tarifa, driver_accepted). Graba RejectedBy='passenger'. La que el pasajero
    /// aceptó (accepted_by_passenger) se deshace con cancel-acceptance.
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

        if(proposal.Status != "pending" && proposal.Status != "driver_accepted")
            return BadRequest(new { error = "Solo se pueden rechazar propuestas pendientes." });

        // Solo si sigue en ese estado (el conductor pudo cambiarla en ese instante).
        if(!await _proposals.TransitionAsync(proposalId, new[] { "pending", "driver_accepted" }, "rejected", "passenger", ct))
            return Conflict(new { error = "Esta propuesta ya no está vigente." });

        // Notificar al conductor que su propuesta fue rechazada.
        _ = _notify.NotifyDriverProposalRejectedAsync(proposal.DriverId, tripId, trip.ServiceType);
        _ = _realtime.ProposalsChangedAsync(tripId, trip.PassengerId, proposal.DriverId, proposalId, "rejected", "rejected_by_passenger");

        return Ok(new { message = "Propuesta rechazada." });
    }

    /// <summary>
    /// PUT /api/trips/{tripId}/proposals/reject-all
    /// El pasajero rechaza TODAS las propuestas pending del viaje (y las
    /// aceptaciones a tarifa, driver_accepted). Cada conductor recibe el aviso
    /// "el pasajero rechazó tu propuesta". La que el pasajero aceptó no se toca.
    /// </summary>
    [HttpPut("{tripId:guid}/proposals/reject-all")]
    public async Task<IActionResult> RejectAll(Guid tripId, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });

        if(trip.PassengerId != CurrentUserId)
            return Forbid();

        var drivers = await _proposals.RejectAllByPassengerAsync(tripId, ct);
        foreach(var driverUserId in drivers.Distinct())
        {
            _ = _notify.NotifyDriverProposalRejectedAsync(driverUserId, tripId, trip.ServiceType);
            _ = _realtime.ProposalsChangedAsync(tripId, trip.PassengerId, driverUserId, null, "rejected", "rejected_all");
        }

        return Ok(new { message = "Todas las propuestas rechazadas.", affected = drivers.Count });
    }

    /// <summary>
    /// POST /api/trips/{tripId}/counter
    /// El pasajero envía una contrapropuesta hacia un conductor específico.
    /// Solo a un conductor que ya ofertó en este viaje y con su oferta vigente.
    /// Monto: entre base_fare y SuggestedFare x fare_max_multiplier.
    /// El conductor la acepta con POST /api/trips/{tripId}/accept-counter/{proposalId}.
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

        if(trip.DriverId is not null ||
           (trip.Status != TripStatus.Pending && trip.Status != TripStatus.Negotiating))
            return BadRequest(new { error = "Este viaje ya no está disponible para negociar." });

        // Rango de precio permitido.
        var rules = await NegotiationRules.LoadAsync(_landing, ct);
        var fareError = rules.FareError(req.Fare, trip.SuggestedFare ?? trip.EstimatedFare);
        if(fareError is not null) return BadRequest(new { error = fareError });

        // Solo a conductores que ofertaron en este viaje y siguen negociando.
        var history = await _proposals.GetHistoryByDriverAsync(tripId, req.DriverId, ct);
        if(!history.Any(h => h.ProposedByRole == "driver"))
            return BadRequest(new { error = "Solo puedes contraofertar a un conductor que ofertó en este viaje." });
        if(history.Any(h => h.Status == "accepted_by_passenger"))
            return Conflict(new { error = "Ya aceptaste la oferta de este conductor. Deshaz la aceptación para contraofertar." });
        if(!history.Any(h => h.Status is "pending" or "driver_accepted"))
            return Conflict(new { error = "Este conductor ya no tiene una oferta vigente en este viaje." });

        // Su oferta (o su aceptación a tarifa) y la contraoferta anterior quedan reemplazadas.
        await _proposals.SupersedePendingAsync(tripId, req.DriverId, includeDriverAccepted: true, ct);

        var counter = TripProposal.CreateCounter(tripId, req.DriverId, req.Fare);
        await _proposals.AddAsync(counter, ct);

        // Notificar al conductor que recibió una contrapropuesta del pasajero.
        _ = _notify.NotifyDriverPassengerCounterAsync(req.DriverId, tripId, req.Fare, trip.ServiceType);
        _ = _realtime.ProposalsChangedAsync(tripId, trip.PassengerId, req.DriverId, counter.Id, "pending", "counter");

        return Ok(new
        {
            message = "Contrapropuesta enviada.",
            proposalId = counter.Id,
        });
    }

    /// <summary>
    /// PUT /api/trips/{tripId}/decline-by-driver
    /// El CONDUCTOR declina el viaje completo (retira su oferta). Marca como
    /// 'rejected' todas sus propuestas abiertas en este viaje: pending (incluidas
    /// las contrapropuestas del pasajero hacia él), driver_accepted y
    /// accepted_by_passenger. El viaje NO se cancela: el pasajero recibe
    /// "El conductor {nombre} retiró su oferta" (type offer_withdrawn).
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

        // Notificar al pasajero que el conductor retiró su oferta, solo si de
        // verdad había negociación con él (si no, el pasajero no sabe de él).
        if(affected > 0)
        {
            _ = _notify.NotifyPassengerOfferWithdrawnAsync(trip.PassengerId, tripId, CurrentUserId, trip.ServiceType);
            _ = _realtime.ProposalsChangedAsync(tripId, trip.PassengerId, CurrentUserId, null, "rejected", "declined");
        }

        return Ok(new
        {
            message = "Viaje declinado.",
            affected,
        });
    }
}

public record CounterRequest(Guid DriverId, decimal Fare);