using Bugie.Trips.Domain.Entities;
using System.Net.Http.Json;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Application.Queries;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Api.Controllers;

[ApiController]
[Route("api/trips")]
[Authorize]
public class TripsController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly ITripRepository _trips;

    private readonly HttpClient _http;

    private readonly ITripProposalRepository _proposals;
    private readonly IPassengerAcceptanceCancellationRepository _cancellations;
    private readonly ITripNotificationService _notify;
    private readonly IRewardsClient _rewardsClient;

    public TripsController(IMediator mediator, ITripRepository trips,
        IHttpClientFactory httpFactory, ITripProposalRepository proposals,
        IPassengerAcceptanceCancellationRepository cancellations,
        ITripNotificationService notify,
        IRewardsClient rewardsClient)
    {
        _mediator = mediator;
        _trips = trips;
        _http = httpFactory.CreateClient();
        _proposals = proposals;
        _cancellations = cancellations;
        _notify = notify;
        _rewardsClient = rewardsClient;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role) ?? "passenger";

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTripRequest req, CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(new CreateTripCommand(
                CurrentUserId,
                req.OriginAddress, req.OriginLat, req.OriginLng,
                req.DestAddress, req.DestLat, req.DestLng,
                req.EstimatedFare, req.PaymentMethod, req.Waypoints,
                req.ServiceType, req.PackageDescription, req.PackageWeightKg,
                req.PackageIsFragile, req.PackageDetails), ct);
            return Ok(dto);
        }
        catch(InvalidOperationException ex)
        {
            // Validación: pasajero no verificado o ya tiene viaje activo.
            return Conflict(new { error = ex.Message });
        }
        catch(KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    [HttpGet("pending")]
    public async Task<IActionResult> Pending(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetPendingTripsQuery(CurrentUserId), ct));

    [HttpGet("active")]
    public async Task<IActionResult> Active(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetActiveTripQuery(CurrentUserId), ct));

    [HttpGet("history")]
    public async Task<IActionResult> History(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetTripHistoryQuery(CurrentUserId, CurrentUserRole), ct));

    [HttpPut("{id:guid}/accept")]
    public async Task<IActionResult> Accept(Guid id, CancellationToken ct)
    {
        try
        {
            var dto = await _mediator.Send(new AcceptTripCommand(id, CurrentUserId), ct);
            // Notificar al pasajero que el conductor confirmó/aceptó.
            _ = _notify.NotifyPassengerDriverConfirmedAsync(dto.PassengerId, id);
            return Ok(dto);
        }
        catch(InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch(KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    /// <summary>
    /// El CONDUCTOR acepta el viaje a la tarifa estimada, pero NO se asigna
    /// todavía: queda como 'driver_accepted' esperando que el PASAJERO confirme.
    /// Varios conductores pueden aceptar; el pasajero elige a uno.
    /// </summary>
    [HttpPost("{id:guid}/driver-accept")]
    public async Task<IActionResult> DriverAccept(Guid id, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
        if(trip.Status != Bugie.Trips.Domain.Enums.TripStatus.Pending &&
           trip.Status != Bugie.Trips.Domain.Enums.TripStatus.Negotiating)
            return BadRequest(new { error = "Este viaje ya no está disponible." });

        // ¿Este conductor ya aceptó este viaje? No duplicar.
        var existing = await _proposals.GetDirectAcceptAsync(id, CurrentUserId, ct);
        if(existing is not null)
            return Ok(new
            {
                message = "Ya aceptaste este viaje. Espera la confirmación del pasajero.",
                proposalId = existing.Id,
                status = "driver_accepted",
            });

        // Crear la aceptación (propuesta a tarifa estimada, estado driver_accepted).
        var accept = Bugie.Trips.Domain.Entities.TripProposal.Create(
            id, CurrentUserId, trip.EstimatedFare);
        accept.Status = "driver_accepted";
        await _proposals.AddAsync(accept, ct);

        // Notificar al pasajero que un conductor aceptó su viaje.
        _ = _notify.NotifyPassengerDriverProposeAsync(trip.PassengerId, id, trip.EstimatedFare);

        return Ok(new
        {
            message = "Aceptación enviada. Espera la confirmación del pasajero.",
            proposalId = accept.Id,
            status = "driver_accepted",
        });
    }

    /// <summary>
    /// El PASAJERO confirma la aceptación de un conductor (flujo "aceptar
    /// directo"). Aquí SÍ se asigna el conductor y el viaje pasa a Accepted.
    /// Las otras aceptaciones/propuestas del viaje se rechazan.
    /// </summary>
    [HttpPut("{id:guid}/confirm-driver-acceptance/{proposalId:guid}")]
    public async Task<IActionResult> ConfirmDriverAcceptance(Guid id, Guid proposalId, CancellationToken ct)
    {
        var proposal = await _proposals.GetByIdAsync(proposalId, ct);
        if(proposal is null) return NotFound(new { error = "Aceptación no encontrada." });
        if(proposal.TripId != id) return BadRequest(new { error = "No pertenece a este viaje." });
        if(proposal.Status != "driver_accepted")
            return Conflict(new { error = "Esta aceptación ya no está vigente." });

        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
        if(trip.PassengerId != CurrentUserId) return Forbid();
        if(trip.DriverId is not null)
            return Conflict(new { error = "Este viaje ya tiene un conductor asignado." });

        // 1) Marcar esta aceptación como aceptada definitiva.
        await _proposals.UpdateStatusAsync(proposalId, "accepted", null, ct);
        // 2) Rechazar las otras propuestas/aceptaciones del mismo viaje.
        await _proposals.RejectOthersAsync(id, proposalId, ct);
        // 3) Cascada: aceptaciones/propuestas del MISMO conductor en OTROS viajes.
        var cascaded = await _proposals.RejectAllOtherPendingByDriverAsync(
            proposal.DriverId, id, ct);

        // 4) Asignar conductor y pasar a Accepted ("Conductor en camino").
        trip.EstimatedFare = proposal.Fare;
        trip.DriverId = proposal.DriverId;
        trip.Status = Bugie.Trips.Domain.Enums.TripStatus.Accepted;
        trip.AcceptedAt = DateTime.UtcNow;
        await _trips.UpdateAsync(trip, ct);

        // 5) Notificar al conductor que el pasajero lo confirmó (va a recogerlo).
        _ = _notify.NotifyDriverPassengerAcceptedAsync(proposal.DriverId, id, proposal.Fare);

        return Ok(new
        {
            tripDto = CreateTripHandler.ToDto(trip),
            otherProposalsRejected = cascaded,
        });
    }

    /// <summary>
    /// Propuesta del conductor. Si ya tiene una propuesta pending para este viaje,
    /// se marca como 'superseded' y se inserta la nueva. Esto preserva el historial.
    /// Si el viaje ya fue tomado por otro conductor, rechaza la propuesta.
    /// </summary>
    [HttpPut("{id:guid}/propose")]
    public async Task<IActionResult> Propose(Guid id, [FromBody] ProposeFareRequest req, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();

        // Validar que el viaje siga disponible (Pending o Negotiating).
        // Si ya fue aceptado, completado, cancelado, etc. → bloquear.
        if(trip.Status != Bugie.Trips.Domain.Enums.TripStatus.Pending &&
            trip.Status != Bugie.Trips.Domain.Enums.TripStatus.Negotiating)
        {
            return BadRequest(new { error = "Este viaje ya no está disponible. Otro conductor lo tomó." });
        }

        // VALIDACIÓN: el conductor no puede proponer si ya está ocupado
        // (viaje activo o propuesta accepted_by_passenger pendiente de confirmar).
        var ownActive = await _trips.GetActiveTripAsync(CurrentUserId, ct);
        if(ownActive is not null)
            return Conflict(new { error = "Ya tienes un viaje activo. Termínalo antes de negociar otro." });

        var waitingConfirm = await _proposals.GetAcceptedByPassengerForDriverAsync(CurrentUserId, ct);
        if(waitingConfirm is not null && waitingConfirm.TripId != id)
            return Conflict(new
            {
                error = "Un pasajero ya aceptó tu propuesta en otro viaje. Confírmalo o esperá a que se cancele.",
                waitingTripId = waitingConfirm.TripId,
            });

        // 1) Marcar como 'superseded' la propuesta pending vigente del conductor (si existe)
        await _proposals.SupersedePendingAsync(id, CurrentUserId, ct);

        // 2) Insertar la nueva propuesta como pending
        var proposal = TripProposal.Create(id, CurrentUserId, req.ProposedFare);
        await _proposals.AddAsync(proposal, ct);

        // 3) Mantener status del viaje en Negotiating (status 7)
        if(trip.Status == Bugie.Trips.Domain.Enums.TripStatus.Pending)
        {
            trip.ProposeFare(CurrentUserId, req.ProposedFare);
            await _trips.UpdateAsync(trip, ct);
        }

        // 4) Notificar al pasajero que llegó una propuesta nueva.
        _ = _notify.NotifyPassengerDriverProposeAsync(trip.PassengerId, id, req.ProposedFare);

        return Ok(new { message = "Propuesta enviada", proposalId = proposal.Id });
    }

    /// <summary>
    /// GET propuestas pending del viaje (lo que el pasajero ve en su pantalla de seguimiento).
    /// Cada propuesta viene enriquecida con nombre del conductor, datos del vehículo y
    /// tendencia respecto a la propuesta anterior del mismo conductor.
    /// </summary>
    [HttpGet("{id:guid}/proposals")]
    public async Task<IActionResult> GetProposals(Guid id, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetEnrichedProposalsQuery(id), ct));

    /// <summary>
    /// Histórico completo de propuestas de un conductor en un viaje.
    /// Solo visual (modal informativo). Incluye pending, superseded, accepted, rejected.
    /// </summary>
    [HttpGet("{id:guid}/proposals/history")]
    public async Task<IActionResult> GetProposalHistory(
        Guid id, [FromQuery] Guid driverId, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetProposalHistoryQuery(id, driverId), ct));

    /// <summary>
    /// El PASAJERO acepta una propuesta del conductor.
    ///
    /// Importante: este endpoint NO asigna el conductor todavía. El viaje
    /// queda en estado normal y la propuesta pasa a 'accepted_by_passenger'.
    /// El conductor verá esa propuesta y deberá confirmar con
    /// PUT /api/trips/{id}/confirm-acceptance/{proposalId} para que el viaje
    /// quede realmente asignado.
    ///
    /// Justificación: el conductor puede tener varias propuestas activas en
    /// distintos viajes, y debe poder elegir cuál confirma. Sin este paso
    /// intermedio se le asignaría automáticamente el primer pasajero que
    /// aceptase, perdiendo control y rechazando sus otras negociaciones de
    /// forma silenciosa.
    /// </summary>
    [HttpPut("{id:guid}/accept-proposal/{proposalId:guid}")]
    public async Task<IActionResult> AcceptProposal(Guid id, Guid proposalId, CancellationToken ct)
    {
        var proposal = await _proposals.GetByIdAsync(proposalId, ct);
        if(proposal is null) return NotFound(new { error = "Propuesta no encontrada." });
        if(proposal.TripId != id) return BadRequest(new { error = "La propuesta no pertenece a este viaje." });
        if(proposal.Status != "pending")
            return Conflict(new { error = "Esta propuesta ya no está vigente." });

        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
        if(trip.PassengerId != CurrentUserId)
            return Forbid();

        // Marcar la propuesta como 'aceptada por el pasajero'.
        // El conductor verá la señal y tendrá que confirmar.
        // Las otras propuestas del MISMO viaje quedan en pending todavía:
        // si el conductor no confirma a tiempo, el pasajero podrá aceptar otra.
        await _proposals.UpdateStatusAsync(proposalId, "accepted_by_passenger", null, ct);

        // Notificar al conductor que su propuesta fue aceptada y que debe
        // confirmar para iniciar el viaje. Es el evento que resolvía el bug
        // de UX: el conductor antes no veía señal hasta volver a la lista.
        _ = _notify.NotifyDriverPassengerAcceptedAsync(proposal.DriverId, id, proposal.Fare);

        return Ok(new
        {
            message = "Propuesta aceptada. Esperando confirmación del conductor.",
            tripId = id,
            proposalId,
            status = "accepted_by_passenger",
        });
    }

    /// <summary>
    /// El CONDUCTOR confirma la propuesta que el pasajero ya aceptó.
    /// Aquí se asigna el conductor y el viaje pasa a 'Accepted'.
    /// Además, todas las otras propuestas pending/accepted_by_passenger del
    /// mismo conductor en OTROS viajes se rechazan en cascada (driver_busy).
    /// </summary>
    [HttpPut("{id:guid}/confirm-acceptance/{proposalId:guid}")]
    public async Task<IActionResult> ConfirmAcceptance(Guid id, Guid proposalId, CancellationToken ct)
    {
        var proposal = await _proposals.GetByIdAsync(proposalId, ct);
        if(proposal is null) return NotFound(new { error = "Propuesta no encontrada." });
        if(proposal.TripId != id) return BadRequest(new { error = "La propuesta no pertenece a este viaje." });
        if(proposal.DriverId != CurrentUserId)
            return Forbid();
        if(proposal.Status != "accepted_by_passenger")
            return Conflict(new { error = "Esta propuesta no está esperando tu confirmación." });

        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
        if(trip.DriverId is not null)
            return Conflict(new { error = "Este viaje ya tiene un conductor asignado." });

        // 1) Marcar la propuesta como aceptada definitiva.
        await _proposals.UpdateStatusAsync(proposalId, "accepted", null, ct);
        // 2) Las otras propuestas DEL MISMO VIAJE pasan a rejected.
        await _proposals.RejectOthersAsync(id, proposalId, ct);
        // 3) RECHAZO EN CASCADA: las propuestas del MISMO CONDUCTOR en OTROS
        //    viajes (pending o accepted_by_passenger) se rechazan con motivo
        //    'driver_busy'. El conductor queda libre solo para este viaje.
        var cascaded = await _proposals.RejectAllOtherPendingByDriverAsync(
            CurrentUserId, id, ct);

        // 4) Asignar conductor y tarifa.
        trip.EstimatedFare = proposal.Fare;
        trip.DriverId = proposal.DriverId;
        trip.Status = Bugie.Trips.Domain.Enums.TripStatus.Accepted;
        trip.AcceptedAt = DateTime.UtcNow;
        await _trips.UpdateAsync(trip, ct);

        // 5) Notificar al pasajero que el conductor confirmó. Viaje en curso.
        _ = _notify.NotifyPassengerDriverConfirmedAsync(trip.PassengerId, id);

        return Ok(new
        {
            tripDto = CreateTripHandler.ToDto(trip),
            otherProposalsRejected = cascaded,
        });
    }

    /// <summary>
    /// El PASAJERO deshace su aceptación de una propuesta antes de que el
    /// conductor confirme. La propuesta vuelve a 'pending' (no se rechaza),
    /// así el conductor puede seguir confirmando si quiere. El pasajero queda
    /// libre para aceptar otra propuesta.
    ///
    /// Se guarda un registro inmutable en trips.PassengerAcceptanceCancellations
    /// con TripId, ProposalId, PassengerId y CanceledAt para auditoría.
    ///
    /// Validaciones:
    /// - Solo el pasajero del viaje puede deshacer.
    /// - La propuesta debe estar en estado 'accepted_by_passenger'.
    /// - El viaje no debe haber sido aceptado por el conductor todavía
    ///   (DriverId == null y status no Accepted/InProgress/Completed/Cancelled).
    /// </summary>
    [HttpPut("{id:guid}/cancel-acceptance/{proposalId:guid}")]
    public async Task<IActionResult> CancelAcceptance(
        Guid id, Guid proposalId, CancellationToken ct)
    {
        var proposal = await _proposals.GetByIdAsync(proposalId, ct);
        if(proposal is null) return NotFound(new { error = "Propuesta no encontrada." });
        if(proposal.TripId != id) return BadRequest(new { error = "La propuesta no pertenece a este viaje." });
        if(proposal.Status != "accepted_by_passenger")
            return Conflict(new { error = "Esta propuesta no está en estado pendiente de confirmación." });

        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
        if(trip.PassengerId != CurrentUserId) return Forbid();

        // Si el viaje ya tiene conductor asignado, NO se puede deshacer.
        // El conductor ya confirmó (race condition: el pasajero presiona
        // "deshacer" justo cuando el conductor presiona "confirmar").
        if(trip.DriverId is not null)
            return Conflict(new
            {
                error = "El conductor ya confirmó. No puedes cambiar de opinión."
            });

        // 1) Volver la propuesta a 'pending'. El conductor podría seguir
        //    confirmando si quiere, pero ya no bloquea al pasajero.
        await _proposals.UpdateStatusAsync(proposalId, "pending", null, ct);

        // 2) Guardar registro histórico (auditoría / métricas).
        await _cancellations.AddAsync(
            Bugie.Trips.Domain.Entities.PassengerAcceptanceCancellation.Create(
                id, proposalId, CurrentUserId),
            ct);

        return Ok(new
        {
            message = "Aceptación deshecha. Puedes aceptar otra propuesta.",
            tripId = id,
            proposalId,
        });
    }

    [HttpPut("{id:guid}/accept-fare")]
    public async Task<IActionResult> AcceptFare(Guid id, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();
        trip.AcceptProposedFare();
        await _trips.UpdateAsync(trip, ct);
        return Ok(CreateTripHandler.ToDto(trip));
    }

    [HttpPut("{id:guid}/reject-fare")]
    public async Task<IActionResult> RejectFare(Guid id, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();
        trip.RejectProposedFare();
        await _trips.UpdateAsync(trip, ct);
        return Ok(CreateTripHandler.ToDto(trip));
    }

    [HttpPut("{id:guid}/start")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct)
    {
        var dto = await _mediator.Send(new StartTripCommand(id), ct);
        // Notificar al pasajero que el viaje arrancó.
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is not null)
            _ = _notify.NotifyPassengerTripStartedAsync(trip.PassengerId, id);
        return Ok(dto);
    }

    /// <summary>
    /// PUT /api/trips/{id}/arrived — el conductor avisa que ya esta en el
    /// punto de recojo. Solo el conductor del viaje y con el viaje aceptado.
    /// Envia un push al pasajero; se puede volver a avisar (reenvia el push).
    /// </summary>
    [HttpPut("{id:guid}/arrived")]
    public async Task<IActionResult> Arrived(Guid id, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();
        if(trip.DriverId != CurrentUserId) return Forbid();
        if(trip.Status != Bugie.Trips.Domain.Enums.TripStatus.Accepted)
            return Conflict(new { error = "Solo puedes avisar tu llegada con el viaje aceptado y antes de iniciarlo." });

        trip.MarkDriverArrived();
        await _trips.UpdateAsync(trip, ct);
        _ = _notify.NotifyPassengerDriverArrivedAsync(trip.PassengerId, id);
        return Ok(CreateTripHandler.ToDto(trip));
    }

    [HttpPut("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] CompleteTripRequest? req, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();

        // Si el viaje trae cupon, se cobra la tarifa YA DESCONTADA. El
        // conductor ve ese monto y es lo que recibe en mano.
        var tarifaBase = req?.FinalFare ?? trip.EstimatedFare;
        var finalFare  = trip.HasCoupon
            ? Math.Max(0, tarifaBase - (trip.DiscountAmount ?? 0))
            : tarifaBase;
        var result = await _mediator.Send(new CompleteTripCommand(id, finalFare), ct);

        // Crear pago automáticamente al completar el viaje
        if(trip.DriverId.HasValue)
        {
            try
            {
                var paymentsUrl = Environment.GetEnvironmentVariable("PAYMENTS_API_URL")
                                  ?? "http://localhost:5004";
                var token = Request.Headers["Authorization"].ToString();
                using var req2 = new HttpRequestMessage(HttpMethod.Post,
                    $"{paymentsUrl}/api/payments");
                req2.Headers.Add("Authorization", token);
                req2.Content = JsonContent.Create(new
                {
                    tripId = trip.Id,
                    passengerId = trip.PassengerId,
                    driverId = trip.DriverId.Value,
                    amount = finalFare,
                    method = trip.PaymentMethod,
                });
                await _http.SendAsync(req2, ct);
            }
            catch { /* No bloquear si payments falla */ }
        }

        // Consumir el cupon, si lo habia. Va DESPUES de completar: si el viaje
        // se hubiera cancelado, el cupon seguiria disponible.
        //
        // Si Rewards no responde, el viaje igual queda completado y cobrado con
        // el descuento. El cupon quedaria sin marcar como usado, que es mejor
        // que tumbar el cierre de un viaje real.
        if(trip.HasCoupon)
        {
            try
            {
                await _rewardsClient.UseCouponAsync(trip.CouponCode!, trip.Id, ct);
            }
            catch { /* el viaje ya se cerro */ }
        }

        return Ok(result);
    }

    public record ApplyCouponRequest(string Code);

    /// <summary>
    /// POST /api/trips/{id}/coupon
    /// El pasajero aplica uno de sus cupones al precio de este viaje.
    ///
    /// El cupon NO se consume aca: se consume al completar el viaje. Si el
    /// viaje se cancela, el cupon queda libre para otra vez.
    /// </summary>
    [HttpPost("{id:guid}/coupon")]
    public async Task<IActionResult> ApplyCoupon(
        Guid id, [FromBody] ApplyCouponRequest body, CancellationToken ct)
    {
        try
        {
            return Ok(await _mediator.Send(
                new ApplyCouponCommand(id, CurrentUserId, body.Code ?? string.Empty), ct));
        }
        catch (KeyNotFoundException ex)         { return NotFound(new { error = ex.Message }); }
        catch (UnauthorizedAccessException ex)  { return StatusCode(403, new { error = ex.Message }); }
        catch (InvalidOperationException ex)    { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>DELETE /api/trips/{id}/coupon</summary>
    [HttpDelete("{id:guid}/coupon")]
    public async Task<IActionResult> RemoveCoupon(Guid id, CancellationToken ct)
    {
        try
        {
            await _mediator.Send(new RemoveCouponCommand(id, CurrentUserId), ct);
            return Ok(new { message = "Cupon quitado." });
        }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (InvalidOperationException ex)   { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>
    /// PUT /api/trips/{id}/cancel  body opcional: { "reason": "..." }
    /// Se guarda QUIEN cancela de verdad (pasajero, conductor o admin):
    ///  - pasajero: mientras el viaje no termine.
    ///  - conductor: solo con el viaje aceptado y antes de iniciarlo
    ///    (ya en curso, se usa SOS o se completa).
    /// Cancelar cierra la negociacion: las propuestas abiertas pasan a
    /// 'cancelled' y se avisa a esos conductores.
    /// </summary>
    [HttpPut("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelTripRequest? req, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();
        if(trip.Status is Bugie.Trips.Domain.Enums.TripStatus.Completed
                       or Bugie.Trips.Domain.Enums.TripStatus.Cancelled)
            return Conflict(new { error = "Este viaje ya no se puede cancelar." });

        string by;
        if(CurrentUserId == trip.PassengerId) by = "passenger";
        else if(trip.DriverId == CurrentUserId) by = "driver";
        else if(User.IsInRole("admin")) by = "admin";
        else return Forbid();

        if(by == "driver" && trip.Status != Bugie.Trips.Domain.Enums.TripStatus.Accepted)
            return Conflict(new { error = "Solo puedes cancelar un viaje aceptado que todavía no empezó." });

        var dto = await _mediator.Send(new CancelTripCommand(id, by, req?.Reason), ct);

        // Cerrar la negociacion y avisar a los conductores que habian ofertado.
        var proposalDrivers = await _proposals.CancelOpenByTripAsync(id, ct);
        foreach(var driverUserId in proposalDrivers.Where(d => d != trip.DriverId))
            _ = _notify.NotifyTripCancelledAsync(driverUserId, id, by);

        // Avisar a la contraparte del viaje.
        if(by != "passenger")
            _ = _notify.NotifyTripCancelledAsync(trip.PassengerId, id, by);
        if(by != "driver" && trip.DriverId.HasValue)
            _ = _notify.NotifyTripCancelledAsync(trip.DriverId.Value, id, by);

        return Ok(dto);
    }

    /// <summary>
    /// El pasajero envía su ubicación actual durante el viaje.
    /// Solo se persiste si tiene un viaje activo. El cliente Flutter
    /// ya hace throttle por distancia (≥20m) y heartbeat (60s), así
    /// que aquí no validamos frecuencia.
    /// Se guarda en trips.Trips (PassengerLastLat/Lng) sin historial,
    /// el admin lo lee para mostrar el mapa en vivo.
    /// </summary>
    [HttpPut("passenger-location")]
    public async Task<IActionResult> UpdatePassengerLocation(
        [FromBody] UpdatePassengerLocationRequest req, CancellationToken ct)
    {
        await _mediator.Send(new UpdatePassengerLocationCommand(
            CurrentUserId, req.Lat, req.Lng), ct);
        return Ok();
    }

    /// <summary>
    /// Admin: lista de viajes en curso con la última posición del pasajero.
    /// Devuelve solo lo necesario para pintar el mapa de monitoreo. NO incluye
    /// rutas, waypoints, ni datos pesados. Polling sugerido: cada 5-10s.
    /// </summary>
    [HttpGet("live-passengers")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> LivePassengers(CancellationToken ct)
    {
        var list = await _trips.GetLivePassengerLocationsAsync(ct);
        return Ok(list.Select(p => new LivePassengerDto(
            p.TripId, p.PassengerId, p.DriverId, p.Status,
            p.Lat ?? 0, p.Lng ?? 0, p.UpdatedAt,
            p.OriginLat, p.OriginLng, p.DestLat, p.DestLng,
            p.DriverLat, p.DriverLng,
            p.PassengerName, p.PassengerPhone, p.PassengerPhotoUrl,
            p.DriverName, p.DriverPhone)));
    }

    // ── Endpoints SOS REMOVIDOS de aquí ──────────────────────────────────
    // Toda la lógica de SOS (activar / listar / resolver) vive ahora en
    // SosController.cs (rutas /api/sos/...). Los endpoints que estaban
    // aquí en /api/trips/sos fueron eliminados para evitar duplicación.

    /// <summary>
    /// Devuelve qué UserIds (de los pasados por query) tienen un viaje activo.
    /// Usado por Drivers.Api para reemplazar el JOIN cross-database.
    /// </summary>
    [HttpGet("active-drivers")]
    public async Task<IActionResult> GetActiveDrivers(
        [FromQuery(Name = "ids")] Guid[] ids, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetActiveDriversQuery(ids ?? Array.Empty<Guid>()), ct));

    [HttpGet("route")]
    [AllowAnonymous]
    public async Task<IActionResult> Route(
        [FromQuery] double olat, [FromQuery] double olng,
        [FromQuery] double dlat, [FromQuery] double dlng,
        CancellationToken ct) =>
        Ok(await _mediator.Send(new GetRouteQuery(olat, olng, dlat, dlng), ct));

    [HttpPost("route/waypoints")]
    [AllowAnonymous]
    public async Task<IActionResult> RouteWithWaypoints(
        [FromBody] WaypointsRouteRequest req, CancellationToken ct) =>
        Ok(await _mediator.Send(new GetRouteWithWaypointsQuery(req.Points), ct));

    /// <summary>
    /// Devuelve las paradas intermedias (waypoints) persistidas de un viaje.
    /// Lo usa el monitor admin para reconstruir la ruta completa (origen +
    /// waypoints + destino) y pedirla a GraphHopper.
    /// </summary>
    [HttpGet("{tripId:guid}/waypoints")]
    [Authorize(Roles = "admin")]
    public async Task<IActionResult> GetTripWaypoints(Guid tripId, CancellationToken ct)
    {
        var list = await _trips.GetWaypointsAsync(tripId, ct);
        return Ok(list.Select(w => new {
            id = w.Id,
            address = w.Address,
            lat = w.Lat,
            lng = w.Lng,
            sortOrder = w.SortOrder,
        }));
    }
}