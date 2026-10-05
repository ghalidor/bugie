using Bugie.Trips.Domain.Entities;

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
    Task RejectOthersAsync(Guid tripId, Guid acceptedId, CancellationToken ct = default);
    Task<TripProposal?> GetDirectAcceptAsync(Guid tripId, Guid driverId, CancellationToken ct = default);
    Task<int> SupersedePendingAsync(Guid tripId, Guid driverId, CancellationToken ct = default);
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
    Task<int> RejectAllByPassengerAsync(Guid tripId, CancellationToken ct = default);

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
    Task<int> RejectAllOtherPendingByDriverAsync(
        Guid driverId, Guid exceptTripId, CancellationToken ct = default);

    /// <summary>
    /// Expira las propuestas que están en estado 'accepted_by_passenger'
    /// pero el conductor no las confirmó dentro de la ventana de tiempo.
    /// Las marca como 'rejected' con RejectedBy = 'driver_no_confirm'.
    /// Devuelve cuántas se expiraron (para log/métrica).
    /// </summary>
    Task<int> ExpireStaleAcceptedByPassengerAsync(
        DateTime cutoffUtc, CancellationToken ct = default);

    /// <summary>
    /// Al cancelarse un viaje se cierra su negociación: todas las propuestas
    /// abiertas (pending, accepted_by_passenger, driver_accepted) pasan a
    /// 'cancelled'. Devuelve los conductores (userId) que tenían propuesta,
    /// para avisarles.
    /// </summary>
    Task<List<Guid>> CancelOpenByTripAsync(Guid tripId, CancellationToken ct = default);

    /// <summary>
    /// Rechaza todas las propuestas (incluida la aceptada) de un conductor en un
    /// viaje. Se usa al republicar un programado cuyo conductor no llegó
    /// (RejectedBy = 'driver_no_show'), para que ya no lo vea como suyo.
    /// </summary>
    Task<int> RejectDriverOnTripAsync(Guid tripId, Guid driverId, string rejectedBy, CancellationToken ct = default);
}