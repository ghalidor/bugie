using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Endpoints específicos del conductor relacionados a propuestas.
/// </summary>
[ApiController]
[Route("api/trips")]
[Authorize]
public class DriverProposalsController : ControllerBase
{
    private readonly ITripProposalRepository _proposals;
    public DriverProposalsController(ITripProposalRepository proposals) =>
        _proposals = proposals;

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>
    /// GET /api/trips/my-counter-proposals?tripIds=...
    /// Para cada tripId, devuelve el estado relevante para el conductor (prioridad):
    ///   - pending  + role='passenger' : contrapropuesta del pasajero (banner naranja).
    ///   - pending  + role='driver'    : mi propia propuesta vigente esperando al pasajero (banner azul).
    ///   - rejected                    : el pasajero rechazó mi última propuesta (banner rojo, 24h).
    /// Nunca devuelve dos a la vez. La contrapropuesta del pasajero siempre tiene prioridad
    /// porque exige acción inmediata del conductor.
    /// </summary>
    [HttpGet("my-counter-proposals")]
    public async Task<IActionResult> MyCounterProposals(
        [FromQuery] List<Guid> tripIds, CancellationToken ct)
    {
        if(tripIds is null || tripIds.Count == 0)
            return Ok(new Dictionary<Guid, CounterProposalDto>());

        var result = new Dictionary<Guid, CounterProposalDto>();
        foreach(var tripId in tripIds.Distinct())
        {
            var all = await _proposals.GetByTripAsync(tripId, ct);

            // 0) MÁXIMA PRIORIDAD: propuesta del conductor que el pasajero ya
            //    aceptó y está esperando que el conductor confirme.
            //    El conductor debe ver banner ÁMBAR/VERDE con botón
            //    "Confirmar y empezar viaje". Mientras tiene esto pendiente,
            //    no puede negociar/aceptar otras solicitudes.
            var waitingConfirm = all.FirstOrDefault(p =>
                p.DriverId == CurrentUserId &&
                p.Status == "accepted_by_passenger");

            if(waitingConfirm is not null)
            {
                result[tripId] = new CounterProposalDto(
                    waitingConfirm.Id, waitingConfirm.Fare, waitingConfirm.CreatedAt,
                    "accepted_by_passenger", waitingConfirm.ProposedByRole);
                continue;
            }

            // 1) Contrapropuesta vigente del pasajero hacia este conductor (banner naranja).
            var counter = all.FirstOrDefault(p =>
                p.DriverId == CurrentUserId &&
                p.ProposedByRole == "passenger" &&
                p.Status == "pending");

            if(counter is not null)
            {
                result[tripId] = new CounterProposalDto(
                    counter.Id, counter.Fare, counter.CreatedAt, "pending", "passenger");
                continue;
            }

            // 2) Mi propia propuesta pending vigente (banner azul "esperando respuesta").
            var myPending = all.FirstOrDefault(p =>
                p.DriverId == CurrentUserId &&
                p.ProposedByRole == "driver" &&
                p.Status == "pending");

            if(myPending is not null)
            {
                result[tripId] = new CounterProposalDto(
                    myPending.Id, myPending.Fare, myPending.CreatedAt, "pending", "driver");
                continue;
            }

            // 3) Feedback de rechazo: última rechazada por el pasajero (24h).
            var lastRejected = await _proposals.GetLastRejectedByPassengerAsync(
                tripId, CurrentUserId, ct);

            if(lastRejected is not null)
            {
                result[tripId] = new CounterProposalDto(
                    lastRejected.Id, lastRejected.Fare, lastRejected.CreatedAt, "rejected", "driver");
            }
        }

        return Ok(result);
    }
}

public record CounterProposalDto(
    Guid Id, decimal Fare, DateTime CreatedAt, string Status, string ProposedByRole);