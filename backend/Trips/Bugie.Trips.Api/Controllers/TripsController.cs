using Bugie.Trips.Domain.Entities;
using System.Net.Http.Json;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;
using System.Security.Claims;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Application.Queries;
using Bugie.Trips.Application.Services;
using Bugie.Trips.Domain.Common;
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
    private readonly IDriversClient _driversClient;
    private readonly ILandingClient _landing;
    // Tiempo real a pasajero y conductor (hub /hubs/trips). Fire-and-forget, nunca lanza.
    private readonly ITripRealtimeNotifier _realtime;
    // Conexion de la peticion (la misma que usan los repositorios): para las transacciones.
    private readonly System.Data.IDbConnection _db;

    public TripsController(IMediator mediator, ITripRepository trips,
        IHttpClientFactory httpFactory, ITripProposalRepository proposals,
        IPassengerAcceptanceCancellationRepository cancellations,
        ITripNotificationService notify,
        IRewardsClient rewardsClient,
        IDriversClient driversClient,
        ILandingClient landing,
        ITripRealtimeNotifier realtime,
        System.Data.IDbConnection db)
    {
        _driversClient = driversClient;
        _landing = landing;
        _realtime = realtime;
        _db = db;
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

    /// <summary>
    /// Solo un usuario con rol driver y perfil de conductor APROBADO (estado 3)
    /// puede actuar como conductor.
    /// null = puede; si no, 403 (no es conductor) o 409 (suspendido, rechazado,
    /// pendiente, sin perfil o Drivers no responde).
    /// </summary>
    private Task<IActionResult?> EnsureApprovedDriverAsync(CancellationToken ct) =>
        Bugie.Trips.Api.Security.DriverAccess.EnsureApprovedDriverAsync(this, _driversClient, CurrentUserId, ct);

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateTripRequest req,
        [FromServices] FluentValidation.IValidator<CreateTripCommand> validator,
        CancellationToken ct)
    {
        // Los envios se crean con sus fotos en POST /api/trips/delivery:
        // un envio sin fotos del paquete no se puede solicitar.
        if(req.ServiceType == Bugie.Trips.Domain.Enums.ServiceType.Delivery)
            return BadRequest(new { error = "Para solicitar un envío usa POST /api/trips/delivery con las fotos del paquete." });

        var cmd = new CreateTripCommand(
            CurrentUserId,
            req.OriginAddress, req.OriginLat, req.OriginLng,
            req.DestAddress, req.DestLat, req.DestLng,
            req.EstimatedFare, req.PaymentMethod, req.Waypoints,
            req.ServiceType, req.PackageDescription, req.PackageWeightKg,
            req.PackageIsFragile, req.PackageDetails,
            req.RecipientName, req.RecipientPhone,
            ScheduledAt: req.ScheduledAt is null ? null : BugieTime.ToUtcFromInput(req.ScheduledAt.Value));

        // Reglas de CreateTripValidator (direcciones, tarifa, datos del envio).
        var validation = await validator.ValidateAsync(cmd, ct);
        if(!validation.IsValid)
            return BadRequest(new { error = validation.Errors[0].ErrorMessage });

        try
        {
            var dto = await _mediator.Send(cmd, ct);
            // Tiempo real: otras pantallas del pasajero y la lista de solicitudes de los conductores.
            _ = _realtime.TripChangedAsync(dto.Id, (int)dto.Status, RealtimeReasons.Created, dto.PassengerId, null);
            _ = _realtime.RequestsChangedAsync(dto.Id, RealtimeReasons.Published);
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

    /// <summary>
    /// GET /api/trips/driver/demand?lat=&amp;lng=&amp;radiusKm=10 — mapa del inicio del conductor.
    /// zones: demanda (pendientes/negociando) de los últimos 30 min en celdas de ~500 m dentro del radio.
    /// nearby: hasta 10 solicitudes que este conductor ve en su lista, por distancia. Sin datos del pasajero.
    /// </summary>
    [HttpGet("driver/demand")]
    [Authorize(Roles = "driver")]
    public async Task<IActionResult> DriverDemand(
        [FromQuery] double? lat, [FromQuery] double? lng,
        [FromQuery] double radiusKm = 10, CancellationToken ct = default)
    {
        if(lat is null || lng is null || double.IsNaN(lat.Value) || double.IsNaN(lng.Value)
           || lat < -90 || lat > 90 || lng < -180 || lng > 180)
            return BadRequest(new { error = "lat y lng son obligatorios y deben ser coordenadas válidas." });
        if(double.IsNaN(radiusKm) || radiusKm <= 0 || radiusKm > 50)
            return BadRequest(new { error = "radiusKm debe estar entre 0 y 50." });

        return Ok(await _mediator.Send(
            new GetDriverDemandQuery(CurrentUserId, lat.Value, lng.Value, radiusKm), ct));
    }

    [HttpGet("active")]
    public async Task<IActionResult> Active(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetActiveTripQuery(CurrentUserId), ct));

    [HttpGet("history")]
    public async Task<IActionResult> History(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetTripHistoryQuery(CurrentUserId, CurrentUserRole), ct));

    /// <summary>
    /// GET /api/trips/scheduled — programados vigentes del usuario (pendientes,
    /// negociando o aceptados), ordenados por hora. Pasajero: los suyos.
    /// Conductor: los que tiene asignados.
    /// </summary>
    [HttpGet("scheduled")]
    public async Task<IActionResult> Scheduled(CancellationToken ct) =>
        Ok(await _mediator.Send(new GetScheduledTripsQuery(CurrentUserId), ct));

    /// <summary>
    /// GET /api/trips/{id}/tracking — seguimiento de UN viaje (como /active, con
    /// conductor y vehiculo). Sirve para un programado que todavia no es el
    /// viaje activo. Solo su pasajero o su conductor.
    /// </summary>
    [HttpGet("{id:guid}/tracking")]
    public async Task<IActionResult> Tracking(Guid id, CancellationToken ct)
    {
        var dto = await _mediator.Send(new GetActiveTripQuery(CurrentUserId, id), ct);
        return dto is null ? NotFound(new { error = "Viaje no encontrado." }) : Ok(dto);
    }

    /// <summary>
    /// PUT /api/trips/{id}/republish — el conductor del programado no llego
    /// (15 min despues de la hora sin "Ya llegue"). El viaje vuelve a pendiente
    /// para otros conductores, se quita al conductor y se le avisa.
    /// </summary>
    [HttpPut("{id:guid}/republish")]
    public async Task<IActionResult> Republish(Guid id, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
        if(trip.PassengerId != CurrentUserId) return Forbid();

        Guid removedDriver;
        try
        {
            removedDriver = trip.Republish(DateTime.UtcNow);
        }
        catch(InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        await _trips.UpdateAsync(trip, ct);

        // El conductor quitado ya no ve el viaje como suyo.
        await _proposals.RejectDriverOnTripAsync(id, removedDriver, "driver_no_show", ct);
        _ = _notify.NotifyDriverRemovedNoShowAsync(removedDriver, id, trip.ServiceType);
        _ = _realtime.TripChangedAsync(trip, RealtimeReasons.Reopened, alsoNotify: new[] { removedDriver });
        _ = _realtime.RequestsChangedAsync(id, RealtimeReasons.RequestsReopened);

        // Los demas conductores lo vuelven a ver (y reciben el aviso).
        await _mediator.Send(new NotifyNearbyDriversCommand(id), ct);

        return Ok(CreateTripHandler.ToDto(trip));
    }

    // PUT /api/trips/{id}/accept (asignacion directa del conductor) se quito:
    // el conductor acepta con driver-accept (el pasajero confirma), propone con
    // propose o acepta la contraoferta del pasajero con accept-counter.

    /// <summary>
    /// Mensaje si el conductor no puede tomar este viaje porque esta ocupado; null si esta libre.
    /// - Inmediato: tiene un viaje activo (o asignado). checkWaiting: ademas, una oferta
    ///   suya aceptada por otro pasajero esperando su confirmacion.
    /// - Programado: choque con otro programado suyo (margen ScheduledTrips.ConflictMarginMinutes)
    ///   o, si este programado empieza dentro de ese margen, un viaje activo.
    /// forDriver: texto para el conductor (true) o para el pasajero (false).
    /// </summary>
    private async Task<string?> DriverBusyMessageAsync(
        Guid driverUserId, Trip trip, bool forDriver, bool checkWaiting, CancellationToken ct)
    {
        var active = await _trips.GetActiveTripAsync(driverUserId, ct);
        if(active is not null && active.Id == trip.Id) active = null;

        if(trip.ScheduledAt.HasValue)
        {
            var conflict = await ScheduledConflicts.FindConflictMessageAsync(_trips, driverUserId, trip, ct, forDriver);
            if(conflict is not null) return conflict;
            if(active is not null &&
               trip.ScheduledAt.Value <= DateTime.UtcNow.AddMinutes(Bugie.Trips.Domain.Common.ScheduledTrips.ConflictMarginMinutes))
                return forDriver
                    ? "Tienes un viaje activo y este programado empieza en menos de 1 hora."
                    : "Este conductor está en otro viaje y no llega a tu programado. Elige otra oferta.";
            return null;
        }

        if(active is not null)
            return forDriver
                ? "Ya tienes un viaje activo. Termínalo antes de tomar otro."
                : "Este conductor ya tomó otro viaje. Elige otra oferta.";

        if(checkWaiting)
        {
            var waiting = await _proposals.GetAcceptedByPassengerForDriverAsync(driverUserId, ct);
            if(waiting is not null && waiting.TripId != trip.Id)
                return "Un pasajero ya aceptó tu propuesta en otro viaje. Confírmalo o espera a que venza.";
        }
        return null;
    }

    private static bool IsSearching(Trip trip) =>
        trip.DriverId is null &&
        (trip.Status == Bugie.Trips.Domain.Enums.TripStatus.Pending ||
         trip.Status == Bugie.Trips.Domain.Enums.TripStatus.Negotiating);

    /// <summary>
    /// Cierra el trato en UNA transaccion: la propuesta pasa a 'accepted' (solo si
    /// sigue en fromStatuses), el viaje se asigna (solo si sigue buscando
    /// conductor), las demas propuestas del viaje se rechazan y, si es inmediato,
    /// las del conductor en otros viajes inmediatos (driver_busy).
    /// Si algo cambio en medio (otro conductor, el pasajero cancelo...) no queda
    /// nada a medias y se responde 409.
    /// Avisa a los conductores cuya oferta aceptada se cerro y a los pasajeros
    /// cuyo conductor elegido quedo ocupado.
    /// </summary>
    private async Task<(IActionResult? Error, int Cascaded)> AssignAsync(
        Trip trip, TripProposal proposal, string[] fromStatuses, string staleMessage, CancellationToken ct)
    {
        if(_db.State != System.Data.ConnectionState.Open) _db.Open();
        List<ClosedProposal> others, cascaded;
        var now = DateTime.UtcNow;
        using(var tx = _db.BeginTransaction())
        {
            // Primero el viaje: su fila es el "candado" comun. Si dos confirmaciones
            // llegan a la vez, la segunda espera aqui y al seguir ve el viaje tomado
            // (0 filas) -> 409. Si se bloqueara primero la propuesta, cada una
            // tendria la suya y al rechazar las demas se cruzarian (deadlock).
            if(!await _trips.AssignDriverAsync(trip.Id, proposal.DriverId, proposal.Fare, now, ct))
            {
                tx.Rollback();
                return (Conflict(new { error = "Este viaje ya fue tomado." }), 0);
            }
            if(!await _proposals.TransitionAsync(proposal.Id, fromStatuses, "accepted", null, ct))
            {
                tx.Rollback();
                return (Conflict(new { error = staleMessage }), 0);
            }
            others = await _proposals.RejectOthersAsync(trip.Id, proposal.Id, ct);
            // Un programado no ocupa al conductor ahora: sin cascada.
            cascaded = trip.IsScheduled
                ? new List<ClosedProposal>()
                : await _proposals.RejectAllOtherPendingByDriverAsync(proposal.DriverId, trip.Id, ct);
            tx.Commit();
        }

        trip.EstimatedFare = proposal.Fare;
        trip.DriverId = proposal.DriverId;
        trip.Status = Bugie.Trips.Domain.Enums.TripStatus.Accepted;
        trip.AcceptedAt = now;
        trip.ProposedFare = null;
        trip.ProposedDriverId = null;

        foreach(var o in others.Where(o => o.OldStatus == "accepted_by_passenger"))
            _ = _notify.NotifyDriverNotChosenAsync(o.DriverId, trip.Id, trip.ServiceType);
        foreach(var c in cascaded.Where(c => c.OldStatus == "accepted_by_passenger"))
            _ = _notify.NotifyPassengerChosenDriverBusyAsync(c.PassengerId, c.TripId, c.ServiceType);

        // Tiempo real: el viaje quedo asignado (pasajero + conductor), la oferta ganadora,
        // las demas ofertas del viaje, las del conductor en otros viajes y la lista de
        // solicitudes de todos los conductores (el viaje ya no esta disponible).
        _ = _realtime.TripChangedAsync(trip, RealtimeReasons.Accepted);
        _ = _realtime.ProposalsChangedAsync(trip.Id, trip.PassengerId, proposal.DriverId, proposal.Id, "accepted", "accepted");
        foreach(var o in others)
            _ = _realtime.ProposalsChangedAsync(trip.Id, trip.PassengerId, o.DriverId, o.ProposalId, "rejected",
                o.OldStatus == "accepted_by_passenger" ? "not_chosen" : "trip_taken");
        foreach(var c in cascaded)
            _ = _realtime.ProposalsChangedAsync(c.TripId, c.PassengerId, c.DriverId, c.ProposalId, "rejected", "driver_busy");
        _ = _realtime.RequestsChangedAsync(trip.Id, RealtimeReasons.Taken);

        return (null, cascaded.Count);
    }

    /// <summary>
    /// El CONDUCTOR acepta el viaje a la tarifa estimada, pero NO se asigna
    /// todavía: queda como 'driver_accepted' esperando que el PASAJERO confirme.
    /// Varios conductores pueden aceptar; el pasajero elige a uno.
    /// </summary>
    [HttpPost("{id:guid}/driver-accept")]
    public async Task<IActionResult> DriverAccept(Guid id, CancellationToken ct)
    {
        var denied = await EnsureApprovedDriverAsync(ct);
        if(denied is not null) return denied;

        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
        if(!IsSearching(trip))
            return BadRequest(new { error = "Este viaje ya no está disponible." });

        // Ocupado: viaje activo, oferta aceptada en otro viaje o choque de programados.
        if(!trip.IsScheduled)
        {
            var waitingConfirm = await _proposals.GetAcceptedByPassengerForDriverAsync(CurrentUserId, ct);
            if(waitingConfirm is not null && waitingConfirm.TripId != id)
                return Conflict(new
                {
                    error = "Un pasajero ya aceptó tu propuesta en otro viaje. Confírmalo o espera a que venza.",
                    waitingTripId = waitingConfirm.TripId,
                });
        }
        var busy = await DriverBusyMessageAsync(CurrentUserId, trip, forDriver: true, checkWaiting: false, ct);
        if(busy is not null) return Conflict(new { error = busy });

        // ¿Este conductor ya aceptó este viaje? No duplicar.
        var existing = await _proposals.GetDirectAcceptAsync(id, CurrentUserId, ct);
        if(existing is not null)
            return Ok(new
            {
                message = "Ya aceptaste este viaje. Espera la confirmación del pasajero.",
                proposalId = existing.Id,
                status = "driver_accepted",
            });

        // Si el pasajero ya aceptó su oferta, lo que corresponde es confirmarla.
        var accepted = await _proposals.GetAcceptedByPassengerOnTripAsync(id, ct);
        if(accepted is not null && accepted.DriverId == CurrentUserId)
            return Conflict(new
            {
                error = "El pasajero ya aceptó tu oferta. Confírmala para tomar el viaje.",
                proposalId = accepted.Id,
            });

        // Su oferta / la contraoferta del pasajero hacia él quedan reemplazadas.
        await _proposals.SupersedePendingAsync(id, CurrentUserId, includeDriverAccepted: false, ct);

        // Crear la aceptación (propuesta a tarifa estimada, estado driver_accepted).
        var accept = Bugie.Trips.Domain.Entities.TripProposal.Create(
            id, CurrentUserId, trip.EstimatedFare);
        accept.Status = "driver_accepted";
        await _proposals.AddAsync(accept, ct);

        // Notificar al pasajero que un conductor aceptó su viaje.
        _ = _notify.NotifyPassengerDriverProposeAsync(trip.PassengerId, id, trip.EstimatedFare, trip.ServiceType);
        _ = _realtime.ProposalsChangedAsync(id, trip.PassengerId, CurrentUserId, accept.Id, "driver_accepted", "driver_accepted");

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
        if(!IsSearching(trip))
            return Conflict(new { error = "Este viaje ya no está disponible." });

        // El conductor tiene que seguir aprobado (pudo ser suspendido despues de aceptar).
        var driverStatus = await _driversClient.GetDriverStatusByUserIdAsync(proposal.DriverId, ct);
        if(driverStatus?.Status != Bugie.Trips.Api.Security.DriverAccess.StatusApproved)
            return Conflict(new { error = "Este conductor ya no está disponible. Elige otra propuesta." });

        // El conductor no puede estar ocupado (viaje activo / choque de programados).
        // Su aceptación se cierra para que el pasajero no la vuelva a ver.
        var busy = await DriverBusyMessageAsync(proposal.DriverId, trip, forDriver: false, checkWaiting: false, ct);
        if(busy is not null)
        {
            await _proposals.TransitionAsync(proposalId, new[] { "driver_accepted" }, "rejected", "driver_busy", ct);
            _ = _realtime.ProposalsChangedAsync(id, trip.PassengerId, proposal.DriverId, proposalId, "rejected", "driver_busy");
            return Conflict(new { error = busy });
        }

        var (error, cascaded) = await AssignAsync(trip, proposal,
            new[] { "driver_accepted" }, "Esta aceptación ya no está vigente.", ct);
        if(error is not null) return error;

        // Aviso al conductor: inmediato "Ve al punto de recojo"; programado, con fecha y hora.
        _ = _notify.NotifyDriverChosenAsync(proposal.DriverId, id, proposal.Fare, trip.ServiceType, trip.ScheduledAt);

        return Ok(new
        {
            tripDto = CreateTripHandler.ToDto(trip),
            otherProposalsRejected = cascaded,
        });
    }

    /// <summary>
    /// Propuesta del conductor. Si ya tiene una propuesta pending (o su aceptación
    /// a tarifa) para este viaje, se marca como 'superseded' y se inserta la nueva.
    /// Esto preserva el historial. Si el viaje ya fue tomado, rechaza la propuesta.
    /// Monto: entre base_fare y SuggestedFare x fare_max_multiplier.
    /// </summary>
    [HttpPut("{id:guid}/propose")]
    public async Task<IActionResult> Propose(Guid id, [FromBody] ProposeFareRequest req, CancellationToken ct)
    {
        var denied = await EnsureApprovedDriverAsync(ct);
        if(denied is not null) return denied;

        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();

        // Validar que el viaje siga disponible (Pending o Negotiating, sin conductor).
        // Si ya fue aceptado, completado, cancelado, etc. → bloquear.
        if(!IsSearching(trip))
        {
            return BadRequest(new { error = "Este viaje ya no está disponible. Otro conductor lo tomó." });
        }

        // Rango de precio permitido.
        var rules = await NegotiationRules.LoadAsync(_landing, ct);
        var fareError = rules.FareError(req.ProposedFare, trip.SuggestedFare ?? trip.EstimatedFare);
        if(fareError is not null) return BadRequest(new { error = fareError });

        // VALIDACIÓN: el conductor no puede proponer si ya está ocupado
        // (viaje activo o propuesta accepted_by_passenger pendiente de confirmar).
        // Programado: no lo bloquea un viaje activo (salvo que empiece en menos
        // de 1 hora), pero no puede chocar con otro programado suyo (margen 1 hora).
        if(trip.IsScheduled)
        {
            var conflict = await DriverBusyMessageAsync(CurrentUserId, trip, forDriver: true, checkWaiting: false, ct);
            if(conflict is not null) return Conflict(new { error = conflict });
        }
        else
        {
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
        }

        // Si el pasajero ya aceptó su oferta en ESTE viaje, no puede cambiar el monto.
        var accepted = await _proposals.GetAcceptedByPassengerOnTripAsync(id, ct);
        if(accepted is not null && accepted.DriverId == CurrentUserId)
            return Conflict(new
            {
                error = "El pasajero ya aceptó tu oferta. Confírmala o espera a que venza.",
                proposalId = accepted.Id,
            });

        // 1) Marcar como 'superseded' la propuesta pending vigente del conductor
        //    (y su aceptación a tarifa, driver_accepted, si la tenía).
        await _proposals.SupersedePendingAsync(id, CurrentUserId, includeDriverAccepted: true, ct);

        // 2) Insertar la nueva propuesta como pending
        var proposal = TripProposal.Create(id, CurrentUserId, req.ProposedFare);
        await _proposals.AddAsync(proposal, ct);

        // 3) Mantener status del viaje en Negotiating (status 7)
        if(trip.Status == Bugie.Trips.Domain.Enums.TripStatus.Pending)
        {
            trip.ProposeFare(CurrentUserId, req.ProposedFare);
            await _trips.UpdateAsync(trip, ct);
            _ = _realtime.TripChangedAsync(trip, RealtimeReasons.Proposal);
        }

        // 4) Notificar al pasajero que llegó una propuesta nueva.
        _ = _notify.NotifyPassengerDriverProposeAsync(trip.PassengerId, id, req.ProposedFare, trip.ServiceType);
        _ = _realtime.ProposalsChangedAsync(id, trip.PassengerId, CurrentUserId, proposal.Id, "pending", "proposed");

        return Ok(new { message = "Propuesta enviada", proposalId = proposal.Id });
    }

    /// <summary>
    /// GET propuestas pending del viaje (lo que el pasajero ve en su pantalla de seguimiento).
    /// Cada propuesta viene enriquecida con nombre del conductor, datos del vehículo y
    /// tendencia respecto a la propuesta anterior del mismo conductor.
    /// </summary>
    // Acceso: el pasajero del viaje o un admin ven todas; un conductor solo
    // ve SUS propuestas en ese viaje; cualquier otro usuario recibe 403.
    [HttpGet("{id:guid}/proposals")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, SkipForNonAdmins = true)]
    public async Task<IActionResult> GetProposals(Guid id, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });

        var seesAll = trip.PassengerId == CurrentUserId || User.IsInRole("admin");
        if(!seesAll && !User.IsInRole("driver")) return Forbid();

        var list = await _mediator.Send(new GetEnrichedProposalsQuery(id), ct);
        if(!seesAll)
            list = list.Where(p => p.DriverId == CurrentUserId).ToList();
        return Ok(list);
    }

    /// <summary>
    /// Histórico completo de propuestas de un conductor en un viaje.
    /// Solo visual (modal informativo). Incluye pending, superseded, accepted, rejected.
    /// </summary>
    [HttpGet("{id:guid}/proposals/history")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, SkipForNonAdmins = true)]
    // Acceso: el pasajero del viaje o un admin (cualquier driverId); un
    // conductor solo su propio historial (driverId = su UserId); si no, 403.
    public async Task<IActionResult> GetProposalHistory(
        Guid id, [FromQuery] Guid driverId, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });

        var allowed = trip.PassengerId == CurrentUserId
                      || User.IsInRole("admin")
                      || driverId == CurrentUserId;
        if(!allowed) return Forbid();

        return Ok(await _mediator.Send(new GetProposalHistoryQuery(id, driverId), ct));
    }

    /// <summary>
    /// El PASAJERO acepta una propuesta del conductor.
    ///
    /// Importante: este endpoint NO asigna el conductor todavía. El viaje
    /// queda en estado normal y la propuesta pasa a 'accepted_by_passenger'.
    /// El conductor verá esa propuesta y deberá confirmar con
    /// PUT /api/trips/{id}/confirm-acceptance/{proposalId} antes de
    /// confirmExpiresAt (driver_confirm_immediate_min / driver_confirm_scheduled_before_min);
    /// si no, vence (rejected / driver_no_confirm).
    ///
    /// Solo puede haber UNA aceptación del pasajero por viaje (índice único):
    /// para elegir otra, primero deshace la actual (cancel-acceptance).
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
        if(proposal.ProposedByRole == "passenger")
            return Conflict(new { error = "Es tu contraoferta: espera la respuesta del conductor." });
        if(!IsSearching(trip))
            return Conflict(new { error = "Este viaje ya no está disponible." });

        // Una sola aceptación del pasajero por viaje.
        var already = await _proposals.GetAcceptedByPassengerOnTripAsync(id, ct);
        if(already is not null)
            return Conflict(new
            {
                error = "Ya aceptaste otra oferta en este viaje. Espera la confirmación de ese conductor o deshaz tu aceptación.",
                acceptedProposalId = already.Id,
            });

        // Marcar la propuesta como 'aceptada por el pasajero' (solo si sigue pending).
        bool marked;
        try
        {
            marked = await _proposals.MarkAcceptedByPassengerAsync(proposalId, ct);
        }
        catch(Npgsql.PostgresException ex) when(ex.SqlState == Npgsql.PostgresErrorCodes.UniqueViolation)
        {
            // Dos aceptaciones al mismo tiempo: el índice único deja pasar solo una.
            return Conflict(new { error = "Ya aceptaste otra oferta en este viaje. Espera la confirmación de ese conductor o deshaz tu aceptación." });
        }
        if(!marked)
            return Conflict(new { error = "Esta propuesta ya no está vigente." });

        // Plazo del conductor para confirmar.
        proposal.AcceptedByPassengerAt = DateTime.UtcNow;
        var rules = await NegotiationRules.LoadAsync(_landing, ct);
        var confirmExpiresAt = rules.ConfirmDeadline(trip, proposal);

        // Notificar al conductor que su propuesta fue aceptada y que debe
        // confirmar (con la hora límite).
        _ = _notify.NotifyDriverPassengerAcceptedAsync(proposal.DriverId, id, proposal.Fare, trip.ServiceType, confirmExpiresAt);
        _ = _realtime.ProposalsChangedAsync(id, trip.PassengerId, proposal.DriverId, proposalId, "accepted_by_passenger", "accepted_by_passenger");

        return Ok(new
        {
            message = "Propuesta aceptada. Esperando confirmación del conductor.",
            tripId = id,
            proposalId,
            status = "accepted_by_passenger",
            confirmExpiresAt,
        });
    }

    /// <summary>
    /// El CONDUCTOR confirma la propuesta que el pasajero ya aceptó.
    /// Aquí se asigna el conductor y el viaje pasa a 'Accepted'.
    /// Además, todas las otras propuestas pending/accepted_by_passenger del
    /// mismo conductor en OTROS viajes inmediatos se rechazan en cascada (driver_busy).
    /// </summary>
    [HttpPut("{id:guid}/confirm-acceptance/{proposalId:guid}")]
    public async Task<IActionResult> ConfirmAcceptance(Guid id, Guid proposalId, CancellationToken ct)
    {
        var denied = await EnsureApprovedDriverAsync(ct);
        if(denied is not null) return denied;

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
        if(!IsSearching(trip))
            return Conflict(new { error = "Este viaje ya no está disponible." });

        // Plazo vencido: se cierra ya (el servicio de vencimientos lo haría en segundos).
        var rules = await NegotiationRules.LoadAsync(_landing, ct);
        if(DateTime.UtcNow > rules.ConfirmDeadline(trip, proposal))
        {
            if(await _proposals.TransitionAsync(proposalId, new[] { "accepted_by_passenger" }, "rejected", "driver_no_confirm", ct))
            {
                _ = _notify.NotifyPassengerDriverNoConfirmAsync(trip.PassengerId, id, trip.ServiceType);
                _ = _realtime.ProposalsChangedAsync(id, trip.PassengerId, CurrentUserId, proposalId, "rejected", "driver_no_confirm");
            }
            return Conflict(new { error = "Se venció el plazo para confirmar este viaje." });
        }

        // Ocupado: viaje activo / choque de programados.
        var busy = await DriverBusyMessageAsync(CurrentUserId, trip, forDriver: true, checkWaiting: false, ct);
        if(busy is not null) return Conflict(new { error = busy });

        var (error, cascaded) = await AssignAsync(trip, proposal,
            new[] { "accepted_by_passenger" }, "Esta propuesta no está esperando tu confirmación.", ct);
        if(error is not null) return error;

        // Notificar al pasajero: inmediato "Conductor en camino"; programado "Conductor asignado para...".
        _ = _notify.NotifyPassengerDriverConfirmedAsync(trip.PassengerId, id, trip.ServiceType, trip.ScheduledAt);

        return Ok(new
        {
            tripDto = CreateTripHandler.ToDto(trip),
            otherProposalsRejected = cascaded,
        });
    }

    /// <summary>
    /// POST /api/trips/{id}/accept-counter/{proposalId}
    /// El CONDUCTOR acepta la contraoferta que el pasajero le envió, a ESE monto.
    /// Como el pasajero ya ofreció ese monto a este conductor, se asigna directo
    /// (no hay paso de confirmación del pasajero), con las mismas validaciones
    /// que confirm-acceptance. Respuesta igual: { tripDto, otherProposalsRejected }.
    /// </summary>
    [HttpPost("{id:guid}/accept-counter/{proposalId:guid}")]
    public async Task<IActionResult> AcceptCounter(Guid id, Guid proposalId, CancellationToken ct)
    {
        var denied = await EnsureApprovedDriverAsync(ct);
        if(denied is not null) return denied;

        var proposal = await _proposals.GetByIdAsync(proposalId, ct);
        if(proposal is null) return NotFound(new { error = "Contraoferta no encontrada." });
        if(proposal.TripId != id) return BadRequest(new { error = "La contraoferta no pertenece a este viaje." });
        if(proposal.DriverId != CurrentUserId) return Forbid();
        if(proposal.ProposedByRole != "passenger")
            return BadRequest(new { error = "Esta no es una contraoferta del pasajero." });
        if(proposal.Status != "pending")
            return Conflict(new { error = "Esta contraoferta ya no está vigente." });

        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound(new { error = "Viaje no encontrado." });
        if(!IsSearching(trip))
            return Conflict(new { error = "Este viaje ya fue tomado." });

        var busy = await DriverBusyMessageAsync(CurrentUserId, trip, forDriver: true, checkWaiting: false, ct);
        if(busy is not null) return Conflict(new { error = busy });

        var (error, cascaded) = await AssignAsync(trip, proposal,
            new[] { "pending" }, "Esta contraoferta ya no está vigente.", ct);
        if(error is not null) return error;

        _ = _notify.NotifyPassengerDriverConfirmedAsync(trip.PassengerId, id, trip.ServiceType, trip.ScheduledAt);

        return Ok(new
        {
            tripDto = CreateTripHandler.ToDto(trip),
            otherProposalsRejected = cascaded,
        });
    }

    /// <summary>
    /// El PASAJERO deshace su aceptación de una propuesta antes de que el
    /// conductor confirme. La propuesta vuelve a 'pending' (no se rechaza),
    /// así el conductor puede seguir ofertando. El pasajero queda libre para
    /// aceptar otra propuesta. Se avisa al conductor.
    ///
    /// Se guarda un registro inmutable en trips.PassengerAcceptanceCancellations
    /// con TripId, ProposalId, PassengerId y CanceledAt para auditoría.
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
        if(trip.DriverId is not null)
            return Conflict(new
            {
                error = "El conductor ya confirmó. No puedes cambiar de opinión."
            });

        // 1) Volver la propuesta a 'pending' solo si sigue esperando confirmación
        //    (si el conductor confirmó en ese instante, gana la confirmación).
        if(!await _proposals.UndoAcceptedByPassengerAsync(proposalId, ct))
            return Conflict(new { error = "Esta propuesta no está en estado pendiente de confirmación." });

        // 2) Guardar registro histórico (auditoría / métricas).
        await _cancellations.AddAsync(
            Bugie.Trips.Domain.Entities.PassengerAcceptanceCancellation.Create(
                id, proposalId, CurrentUserId),
            ct);

        // 3) Avisar al conductor: ya no tiene que confirmar.
        _ = _notify.NotifyDriverAcceptanceUndoneAsync(proposal.DriverId, id, trip.ServiceType);
        _ = _realtime.ProposalsChangedAsync(id, trip.PassengerId, proposal.DriverId, proposalId, "pending", "acceptance_undone");

        return Ok(new
        {
            message = "Aceptación deshecha. Puedes aceptar otra propuesta.",
            tripId = id,
            proposalId,
        });
    }

    /// <summary>
    /// GET /api/trips/{id} — un viaje (pasajero, conductor del viaje o admin).
    /// Lo usan las pantallas de seguimiento para saber como termino un viaje
    /// que ya no esta activo (completado o cancelado, quien y por que).
    /// </summary>
    [HttpGet("{id:guid}")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewComplaints, Perm.ViewSosCenter, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewPayments, Perm.ViewCommissions, SkipForNonAdmins = true)]
    public async Task<IActionResult> GetOne(Guid id, [FromServices] IAuthClient auth, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();
        if(trip.PassengerId != CurrentUserId && trip.DriverId != CurrentUserId && !User.IsInRole("admin"))
            return Forbid();
        if(!User.IsInRole("admin")) return Ok(CreateTripHandler.ToDto(trip));

        // Admin: con los nombres del pasajero y del conductor (enlaces del detalle).
        var ids = new List<Guid> { trip.PassengerId };
        if(trip.DriverId.HasValue) ids.Add(trip.DriverId.Value);
        var users = await auth.GetUsersByIdsAsync(ids, ct);
        return Ok(CreateTripHandler.ToDto(trip,
            passengerName: users.GetValueOrDefault(trip.PassengerId)?.FullName,
            driverName: trip.DriverId.HasValue ? users.GetValueOrDefault(trip.DriverId.Value)?.FullName : null));
    }

    [HttpPut("{id:guid}/start")]
    public async Task<IActionResult> Start(Guid id, CancellationToken ct)
    {
        // Solo el conductor asignado puede iniciar su viaje.
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();
        if(trip.DriverId != CurrentUserId) return Forbid();
        var denied = await EnsureApprovedDriverAsync(ct);
        if(denied is not null) return denied;

        TripDto dto;
        try
        {
            dto = await _mediator.Send(new StartTripCommand(id), ct);
        }
        catch(InvalidOperationException ex)
        {
            // Ej.: envio sin verificar el recojo, o viaje que no esta aceptado.
            return Conflict(new { error = ex.Message });
        }
        // Notificar al pasajero que el viaje arrancó.
        _ = _notify.NotifyPassengerTripStartedAsync(trip.PassengerId, id, trip.ServiceType);
        _ = _realtime.TripChangedAsync(id, (int)dto.Status, RealtimeReasons.Started, trip.PassengerId, trip.DriverId);
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
        var denied = await EnsureApprovedDriverAsync(ct);
        if(denied is not null) return denied;
        if(trip.Status != Bugie.Trips.Domain.Enums.TripStatus.Accepted)
            return Conflict(new { error = "Solo puedes avisar tu llegada con el viaje aceptado y antes de iniciarlo." });

        try
        {
            trip.MarkDriverArrived();
        }
        catch(InvalidOperationException ex)
        {
            // Ej.: programado y todavia es muy pronto.
            return Conflict(new { error = ex.Message });
        }
        await _trips.UpdateAsync(trip, ct);
        _ = _notify.NotifyPassengerDriverArrivedAsync(trip.PassengerId, id, trip.ServiceType);
        _ = _realtime.TripChangedAsync(trip, RealtimeReasons.DriverArrived);
        return Ok(CreateTripHandler.ToDto(trip));
    }

    [HttpPut("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] CompleteTripRequest? req, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(id, ct);
        if(trip is null) return NotFound();
        // Solo el conductor asignado puede completar su viaje.
        if(trip.DriverId != CurrentUserId) return Forbid();
        var denied = await EnsureApprovedDriverAsync(ct);
        if(denied is not null) return denied;

        // Se cobra la tarifa acordada del viaje (EstimatedFare se actualiza al
        // aceptar una oferta). No se toma del cuerpo de la peticion para que
        // nadie pueda cambiar el monto al cerrar.
        // Si el viaje trae cupon, se cobra la tarifa YA DESCONTADA. El
        // conductor ve ese monto y es lo que recibe en mano.
        var tarifaBase = trip.EstimatedFare;
        var finalFare  = trip.HasCoupon
            ? Math.Max(0, tarifaBase - (trip.DiscountAmount ?? 0))
            : tarifaBase;
        TripDto result;
        try
        {
            result = await _mediator.Send(new CompleteTripCommand(id, finalFare), ct);
        }
        catch(InvalidOperationException ex)
        {
            // Ej.: envio sin confirmar la entrega, o viaje que no esta en curso.
            return Conflict(new { error = ex.Message });
        }

        // Tiempo real: pasajero y conductor (la pantalla pasa a "viaje terminado").
        _ = _realtime.TripChangedAsync(id, (int)result.Status, RealtimeReasons.Completed, trip.PassengerId, trip.DriverId);

        // Crear pago automáticamente al completar el viaje
        if(trip.DriverId.HasValue)
        {
            try
            {
                // Direccion de Payments desde appsettings (Services:PaymentsApi), como los
                // demas servicios. En el servidor se cambia ahi.
                var paymentsUrl = (HttpContext.RequestServices.GetRequiredService<IConfiguration>()["Services:PaymentsApi"]
                                  ?? Environment.GetEnvironmentVariable("PAYMENTS_API_URL")
                                  ?? "http://localhost:5004").TrimEnd('/');
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
            var applied = await _mediator.Send(
                new ApplyCouponCommand(id, CurrentUserId, body.Code ?? string.Empty), ct);
            await NotifyCouponChangedAsync(id, ct);
            return Ok(applied);
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
            await NotifyCouponChangedAsync(id, ct);
            return Ok(new { message = "Cupon quitado." });
        }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (InvalidOperationException ex)   { return BadRequest(new { error = ex.Message }); }
    }

    /// <summary>TripChanged (reason coupon): el conductor ve al instante el nuevo monto a cobrar.</summary>
    private async Task NotifyCouponChangedAsync(Guid tripId, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(tripId, ct);
        if(trip is not null) _ = _realtime.TripChangedAsync(trip, RealtimeReasons.Coupon);
    }

    /// <summary>
    /// PUT /api/trips/{id}/cancel  body opcional: { "reason": "..." }
    /// Se guarda QUIEN cancela de verdad (pasajero, conductor o admin):
    ///  - pasajero: mientras el viaje no termine.
    ///  - conductor: solo con el viaje aceptado y antes de iniciarlo
    ///    (ya en curso, se usa SOS o se completa). Si es un PROGRAMADO y
    ///    todavia no llega su hora, el viaje no se cancela: vuelve a Pending
    ///    sin conductor para otros conductores (respuesta: el viaje reabierto).
    /// Cancelar cierra la negociacion: las propuestas abiertas pasan a
    /// 'cancelled' y se avisa a esos conductores.
    /// </summary>
    [HttpPut("{id:guid}/cancel")]
    [RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewSosCenter, SkipForNonAdmins = true)]
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

        // Programado aceptado que el conductor cancela ANTES de su hora: el viaje
        // no se cancela, vuelve a buscar conductor (Pending, sin conductor, sigue
        // programado). Si ya paso la hora, se cancela como siempre.
        if(by == "driver" && trip.ScheduledAt.HasValue && trip.ScheduledAt.Value > DateTime.UtcNow)
        {
            var driverUserId = CurrentUserId;
            if(!await _trips.ReopenScheduledAfterDriverCancelAsync(id, driverUserId, DateTime.UtcNow, ct))
                return Conflict(new { error = "Este viaje ya no se puede cancelar." });

            // Su propuesta aceptada queda rechazada (motivo driver_cancelled) y
            // cualquier otra abierta del viaje se cierra (trip_reopened).
            await _proposals.RejectDriverOnTripAsync(id, driverUserId, "driver_cancelled", ct);
            await _proposals.CancelOpenByTripAsync(id, "trip_reopened", ct);

            _ = _notify.NotifyPassengerDriverCancelledReopenedAsync(trip.PassengerId, id, trip.ScheduledAt, trip.ServiceType);
            _ = _realtime.TripChangedAsync(id, (int)Bugie.Trips.Domain.Enums.TripStatus.Pending, RealtimeReasons.Reopened,
                trip.PassengerId, null, new[] { driverUserId });
            _ = _realtime.RequestsChangedAsync(id, RealtimeReasons.RequestsReopened);
            // Los demas conductores lo vuelven a ver (y reciben el aviso de solicitud nueva).
            await _mediator.Send(new NotifyNearbyDriversCommand(id), ct);

            var reopened = await _trips.GetByIdAsync(id, ct);
            return Ok(CreateTripHandler.ToDto(reopened!));
        }

        // Programado cuyo conductor no llego: el pasajero cancela sin penalidad.
        var reason = req?.Reason;
        if(by == "passenger" && string.IsNullOrWhiteSpace(reason) && trip.IsDriverLate(DateTime.UtcNow))
            reason = "El conductor no llegó a la hora programada.";

        // Si seguia buscando conductor, la lista de solicitudes de los conductores cambia.
        var wasSearching = IsSearching(trip);
        var dto = await _mediator.Send(new CancelTripCommand(id, by, reason), ct);

        // Cerrar la negociacion y avisar a los conductores que habian ofertado.
        var proposalDrivers = await _proposals.CancelOpenByTripAsync(id, "trip_cancelled", ct);
        foreach(var driverUserId in proposalDrivers.Where(d => d != trip.DriverId))
            _ = _notify.NotifyTripCancelledAsync(driverUserId, id, by, dto.CancelReason, trip.ServiceType);

        // Avisar a la contraparte del viaje (con el motivo).
        if(by != "passenger")
            _ = _notify.NotifyTripCancelledAsync(trip.PassengerId, id, by, dto.CancelReason, trip.ServiceType);
        if(by != "driver" && trip.DriverId.HasValue)
            _ = _notify.NotifyTripCancelledAsync(trip.DriverId.Value, id, by, dto.CancelReason, trip.ServiceType);

        // Tiempo real: pasajero, conductor asignado y conductores que habian ofertado.
        _ = _realtime.TripChangedAsync(id, (int)dto.Status, RealtimeReasons.Cancelled, trip.PassengerId, trip.DriverId, proposalDrivers);
        if(wasSearching)
            _ = _realtime.RequestsChangedAsync(id, RealtimeReasons.Withdrawn);

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
    [RequirePermission(Perm.ViewLiveMap)]
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
    [RequirePermission(Perm.ViewTrips, Perm.ViewLiveMap, Perm.ViewComplaints, Perm.ViewSosCenter, Perm.ViewPassengers, Perm.ViewDrivers, Perm.ViewPayments, Perm.ViewCommissions)]
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