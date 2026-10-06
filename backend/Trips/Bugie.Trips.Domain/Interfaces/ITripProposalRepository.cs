using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Enums;

namespace Bugie.Trips.Domain.Interfaces;

public interface ITripProposalRepository
{
    /// <summary>
    /// Devuelve propuestas activas del viaje (pending) + recientemente rechazadas
    /// por el conductor (últimas 24h) para que el pasajero vea el feedback.
    /// </summary>
    Task<List<TripProposal>> GetByTripAsync(Guid tripId, CancellationToken ct = default);

    Task AddAsync(TripProposal proposal, CancellationToken ct = default);
    Task<TripProposal?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task UpdateStatusAsync(Guid id, string status, string? rejectedBy, CancellationToken ct = default);

    /// <summary>
    /// Cambia el estado SOLO si la propuesta sigue en uno de los estados
    /// esperados (from). false = otro proceso la cambio antes (carrera).
    /// </summary>
    Task<bool> TransitionAsync(Guid id, string[] from, string to, string? rejectedBy = null,
        CancellationToken ct = default);

    /// <summary>pending -> accepted_by_passenger con la hora de aceptacion. false si ya no estaba pending.</summary>
    Task<bool> MarkAcceptedByPassengerAsync(Guid id, CancellationToken ct = default);

    /// <summary>accepted_by_passenger -> pending (el pasajero deshace). false si ya no estaba en ese estado.</summary>
    Task<bool> UndoAcceptedByPassengerAsync(Guid id, CancellationToken ct = default);

    /// <summary>La propuesta accepted_by_passenger vigente del viaje (solo puede haber una).</summary>
    Task<TripProposal?> GetAcceptedByPassengerOnTripAsync(Guid tripId, CancellationToken ct = default);

    /// <summary>
    /// Al asignar el viaje: las demas propuestas abiertas del viaje (pending,
    /// driver_accepted, accepted_by_passenger) pasan a rejected/passenger.
    /// Devuelve las cerradas con su estado anterior (para avisar).
    /// </summary>
    Task<List<ClosedProposal>> RejectOthersAsync(Guid tripId, Guid acceptedId, CancellationToken ct = default);
    Task<TripProposal?> GetDirectAcceptAsync(Guid tripId, Guid driverId, CancellationToken ct = default);

    /// <summary>
    /// Marca superseded lo pending entre el viaje y el conductor (su oferta o
    /// la contraoferta del pasajero). includeDriverAccepted: tambien su
    /// aceptacion a tarifa (driver_accepted), cuando la reemplaza otro monto.
    /// </summary>
    Task<int> SupersedePendingAsync(Guid tripId, Guid driverId, bool includeDriverAccepted = false,
        CancellationToken ct = default);
    Task<List<TripProposal>> GetHistoryByDriverAsync(
        Guid tripId, Guid driverId, CancellationToken ct = default);
    Task<int> RejectAllBetweenAsync(Guid tripId, Guid driverId, CancellationToken ct = default);

    /// <summary>
    /// Devuelve la última (más reciente, últimas 24h) propuesta entre un conductor
    /// y un viaje rechazada por el PASAJERO. Sirve para que el conductor vea
    /// el feedback "el pasajero rechazó tu propuesta".
    /// </summary>
    Task<TripProposal?> GetLastRejectedByPassengerAsync(
        Guid tripId, Guid driverId, CancellationToken ct = default);

    /// <summary>
    /// Devuelve la propuesta pending más reciente entre un viaje y un conductor.
    /// Usado al aceptar el viaje: si hay una contrapropuesta del pasajero
    /// pendiente, su tarifa es la que debe usarse al cerrar el trato.
    /// </summary>
    Task<TripProposal?> GetPendingBetweenAsync(
        Guid tripId, Guid driverId, CancellationToken ct = default);

    /// <summary>
    /// Rechaza TODAS las propuestas pending del viaje desde el lado del pasajero.
    /// Marca como 'rejected' con RejectedBy = 'passenger'.
    /// </summary>
    /// Incluye las aceptaciones a tarifa (driver_accepted). Devuelve los conductores afectados.
    Task<List<Guid>> RejectAllByPassengerAsync(Guid tripId, CancellationToken ct = default);

    /// <summary>
    /// Devuelve los TripIds donde el conductor tiene al menos una propuesta
    /// que NO está rejected. Sirve para incluir esos viajes en la lista de
    /// pending del conductor aunque estén fuera del radio de cercanía
    /// (no perder la negociación en curso).
    /// </summary>
    Task<List<Guid>> GetTripIdsWithActiveProposalAsync(
        Guid driverId, CancellationToken ct = default);

    /// <summary>
    /// Devuelve la propuesta del conductor en estado 'accepted_by_passenger'
    /// (si existe). Si tiene una, no debe poder aceptar otra ni negociar:
    /// debe confirmar o que expire. Solo puede haber UNA a la vez por conductor.
    /// </summary>
    Task<TripProposal?> GetAcceptedByPassengerForDriverAsync(
        Guid driverId, CancellationToken ct = default);

    /// <summary>
    /// Cuando el conductor confirma una propuesta, rechaza en cascada TODAS
    /// las otras propuestas pending del mismo conductor en OTROS viajes.
    /// Motivo: 'driver_busy'. Devuelve cuántas se rechazaron.
    /// </summary>
    Task<List<ClosedProposal>> RejectAllOtherPendingByDriverAsync(
        Guid driverId, Guid exceptTripId, CancellationToken ct = default);

    /// <summary>
    /// Expira las propuestas 'accepted_by_passenger' que el conductor no
    /// confirmo a tiempo (ver NegotiationSettings.ConfirmDeadline):
    /// inmediato = aceptacion + immediateMinutes; programado = hora del viaje
    /// - scheduledBeforeMinutes (nunca antes de aceptacion + immediateMinutes).
    /// Pasan a rejected / 'driver_no_confirm'. Devuelve las expiradas.
    /// </summary>
    Task<List<ClosedProposal>> ExpireUnconfirmedAsync(
        DateTime nowUtc, int immediateMinutes, int scheduledBeforeMinutes, CancellationToken ct = default);

    /// <summary>
    /// Al cancelarse un viaje se cierra su negociación: todas las propuestas
    /// abiertas (pending, accepted_by_passenger, driver_accepted) pasan a
    /// 'cancelled'. Devuelve los conductores (userId) que tenían propuesta,
    /// para avisarles.
    /// </summary>
    /// closedBy queda en RejectedBy: 'trip_cancelled' o 'trip_reopened'
    /// (programado que volvio a buscar conductor).
    Task<List<Guid>> CancelOpenByTripAsync(Guid tripId, string closedBy = "trip_cancelled",
        CancellationToken ct = default);

    /// <summary>
    /// Rechaza todas las propuestas (incluida la aceptada) de un conductor en un
    /// viaje. Se usa al republicar un programado cuyo conductor no llegó
    /// (RejectedBy = 'driver_no_show'), para que ya no lo vea como suyo.
    /// </summary>
    Task<int> RejectDriverOnTripAsync(Guid tripId, Guid driverId, string rejectedBy, CancellationToken ct = default);
}

/// <summary>
/// Propuesta cerrada por una operacion en bloque, con su estado anterior y
/// datos del viaje para avisar a quien corresponda.
/// </summary>
public class ClosedProposal
{
    public Guid ProposalId { get; set; }
    public Guid TripId { get; set; }
    public Guid DriverId { get; set; }
    public decimal Fare { get; set; }
    public string OldStatus { get; set; } = string.Empty;
    public Guid PassengerId { get; set; }
    public ServiceType ServiceType { get; set; }
}
