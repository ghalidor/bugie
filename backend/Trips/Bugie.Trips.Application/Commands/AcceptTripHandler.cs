using MediatR;
using Bugie.Trips.Application.Services;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public class AcceptTripHandler : IRequestHandler<AcceptTripCommand, TripDto>
{
    private readonly ITripRepository _trips;
    private readonly ITripProposalRepository _proposals;
    private readonly IDriversClient _drivers;

    private const int DriverStatusApproved = 3;

    public AcceptTripHandler(
        ITripRepository trips,
        ITripProposalRepository proposals,
        IDriversClient drivers)
    {
        _trips = trips;
        _proposals = proposals;
        _drivers = drivers;
    }

    public async Task<TripDto> Handle(AcceptTripCommand cmd, CancellationToken ct)
    {
        // 1. Verificar que el conductor esté aprobado
        // NOTA: cmd.DriverId aquí es realmente el UserId del conductor (viene del JWT),
        // por eso usamos GetDriverStatusByUserIdAsync (no GetDriverStatusAsync que espera DriverId).
        var status = await _drivers.GetDriverStatusByUserIdAsync(cmd.DriverId, ct);
        if(status is null)
            throw new InvalidOperationException("No se pudo verificar el estado del conductor.");

        if(status.Status == 4)
            throw new InvalidOperationException("Tu cuenta está suspendida. No puedes aceptar viajes.");
        if(status.Status == 5)
            throw new InvalidOperationException("Tu registro como conductor no fue aceptado. No puedes aceptar viajes.");
        if(status.Status != DriverStatusApproved)
            throw new InvalidOperationException(
                "Tu cuenta de conductor aún no está aprobada. No puedes aceptar viajes.");

        // 1.b VALIDACIÓN: el conductor no puede aceptar un viaje si ya tiene
        // otro activo (Accepted/InProgress/Sos/Negotiating) o si tiene una
        // propuesta esperando su confirmación (estado accepted_by_passenger).
        // Para esa propuesta debe usar /confirm-acceptance, no /accept.
        // 2. Cargar el viaje
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct)
            ?? throw new KeyNotFoundException("Viaje no encontrado.");

        if(trip.IsScheduled)
        {
            // Programado: no lo bloquea un viaje activo (es para mas tarde),
            // pero no puede chocar con otro programado suyo (margen 1 hora).
            await ScheduledConflicts.EnsureNoConflictAsync(_trips, cmd.DriverId, trip, ct);
        }
        else
        {
            var ownActive = await _trips.GetActiveTripAsync(cmd.DriverId, ct);
            if(ownActive is not null && ownActive.Id != cmd.TripId)
                throw new InvalidOperationException(
                    "Ya tienes un viaje activo. Termínalo antes de aceptar otro.");

            var waitingConfirm = await _proposals.GetAcceptedByPassengerForDriverAsync(cmd.DriverId, ct);
            if(waitingConfirm is not null && waitingConfirm.TripId != cmd.TripId)
                throw new InvalidOperationException(
                    "Un pasajero ya aceptó tu propuesta en otro viaje. Confírmalo o esperá a que se cancele.");
        }

        // 3. ¿Hay una propuesta pending entre este conductor y este viaje?
        //    Si sí, esa es la tarifa pactada (puede venir de una contrapropuesta
        //    del pasajero que el conductor está aceptando ahora, o de la propia
        //    propuesta del conductor que el pasajero todavía no había aceptado).
        //    Si no, queda la EstimatedFare original.
        var pending = await _proposals.GetPendingBetweenAsync(cmd.TripId, cmd.DriverId, ct);
        if(pending is not null)
        {
            // Marca la propuesta como aceptada (cierre del trato)
            await _proposals.UpdateStatusAsync(pending.Id, "accepted", null, ct);
            // Cualquier otra propuesta pending del viaje queda rechazada
            await _proposals.RejectOthersAsync(cmd.TripId, pending.Id, ct);
            // Actualiza la tarifa del viaje con el monto pactado
            trip.EstimatedFare = pending.Fare;
        }

        // 4. Aceptar el viaje
        trip.Accept(cmd.DriverId);
        await _trips.UpdateAsync(trip, ct);

        var waypoints = await _trips.GetWaypointsAsync(trip.Id, ct);
        var wpDtos = waypoints.OrderBy(w => w.SortOrder)
            .Select(w => new WaypointDto(w.Id, w.Address, w.Lat, w.Lng, w.SortOrder)).ToList();

        return CreateTripHandler.ToDto(trip, wpDtos);
    }
}