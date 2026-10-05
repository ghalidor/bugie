using Bugie.Trips.Domain.Enums;

namespace Bugie.Trips.Domain.External;

/// <summary>
/// Servicio centralizado para mandar pushes FCM en eventos clave del flujo
/// de negociación. Centraliza la lógica de construir el mensaje + obtener
/// los tokens + enviar, para que cada controller solo llame al método
/// correspondiente al evento.
///
/// Todos los métodos son fire-and-forget: si fallan no rompen la request
/// principal. Usan CancellationToken.None internamente para no cortarse al
/// terminar el HTTP request del cliente.
///
/// `service` indica si es un viaje o un envío: cambia el texto ("viaje" /
/// "envío") y va en el push (data "service") para que la app muestre el
/// icono correcto. Cada push lleva además "from" (passenger / driver /
/// bugie) para mostrar de quién viene el aviso.
/// </summary>
public interface ITripNotificationService
{
    /// <summary>
    /// El pasajero aceptó la propuesta del conductor. Falta que el conductor
    /// confirme para iniciar el viaje.
    /// → Push al CONDUCTOR.
    /// </summary>
    Task NotifyDriverPassengerAcceptedAsync(
        Guid driverUserId, Guid tripId, decimal fare, ServiceType service = ServiceType.Ride);

    /// <summary>
    /// El conductor confirmó la aceptación. Viaje en curso.
    /// → Push al PASAJERO.
    /// </summary>
    Task NotifyPassengerDriverConfirmedAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride);

    /// <summary>
    /// El pasajero envió una contrapropuesta a un conductor específico.
    /// → Push al CONDUCTOR.
    /// </summary>
    Task NotifyDriverPassengerCounterAsync(
        Guid driverUserId, Guid tripId, decimal fare, ServiceType service = ServiceType.Ride);

    /// <summary>
    /// El conductor envió una propuesta (o contrapropuesta) al pasajero.
    /// → Push al PASAJERO.
    /// </summary>
    Task NotifyPassengerDriverProposeAsync(
        Guid passengerUserId, Guid tripId, decimal fare, ServiceType service = ServiceType.Ride);

    /// <summary>
    /// El conductor inició el viaje. El pasajero debe estar en el punto.
    /// → Push al PASAJERO.
    /// </summary>
    Task NotifyPassengerTripStartedAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride);

    /// <summary>
    /// El conductor avisa que ya esta en el punto de recojo.
    /// → Push al PASAJERO (la app muestra un aviso emergente).
    /// </summary>
    Task NotifyPassengerDriverArrivedAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride);

    /// <summary>
    /// El conductor o pasajero canceló el viaje.
    /// → Push a la CONTRAPARTE.
    /// </summary>
    Task NotifyTripCancelledAsync(
        Guid recipientUserId, Guid tripId, string cancelledByRole, string? reason = null,
        ServiceType service = ServiceType.Ride);

    /// <summary>
    /// El pasajero rechazó la propuesta del conductor.
    /// → Push al CONDUCTOR.
    /// </summary>
    Task NotifyDriverProposalRejectedAsync(
        Guid driverUserId, Guid tripId, ServiceType service = ServiceType.Ride);

    /// <summary>
    /// Envío: el conductor verificó y recogió el paquete.
    /// → Push + correo al PASAJERO (remitente).
    /// </summary>
    Task NotifyPassengerPackagePickedUpAsync(
        Guid passengerUserId, Guid tripId, string? description);

    /// <summary>
    /// Envío: el conductor entregó el paquete (foto + quién recibió).
    /// → Push + correo al PASAJERO (remitente).
    /// </summary>
    Task NotifyPassengerPackageDeliveredAsync(
        Guid passengerUserId, Guid tripId, string receivedBy);

    /// <summary>
    /// El conductor se desvió de la ruta planificada (detectado en el backend).
    /// → Push al PASAJERO para tranquilizarlo: el monitoreo ya está atento.
    /// </summary>
    Task NotifyPassengerRouteDeviationAsync(
        Guid passengerUserId, Guid tripId, ServiceType service = ServiceType.Ride);

    /// <summary>
    /// Recordatorio de un programado aceptado (30 y 10 min antes).
    /// → Push al CONDUCTOR (toDriver = true) o al PASAJERO.
    /// </summary>
    Task NotifyScheduledReminderAsync(
        Guid userId, Guid tripId, bool toDriver, int minutesLeft, DateTime scheduledAtUtc,
        ServiceType service = ServiceType.Ride);

    /// <summary>
    /// Programado que sigue sin conductor cuando faltan ~30 min.
    /// → Push al PASAJERO.
    /// </summary>
    Task NotifyScheduledNoDriverYetAsync(
        Guid passengerUserId, Guid tripId, int minutesLeft, DateTime scheduledAtUtc,
        ServiceType service = ServiceType.Ride);

    /// <summary>
    /// Bugie canceló el programado porque llegó la hora y nadie lo aceptó.
    /// → Push al PASAJERO (type = trip_cancelled, cancelled_by = system).
    /// </summary>
    Task NotifyScheduledExpiredAsync(
        Guid passengerUserId, Guid tripId, string reason, ServiceType service = ServiceType.Ride);

    /// <summary>
    /// El pasajero republicó su programado porque el conductor no llegó:
    /// se quitó al conductor del viaje.
    /// → Push al CONDUCTOR.
    /// </summary>
    Task NotifyDriverRemovedNoShowAsync(
        Guid driverUserId, Guid tripId, ServiceType service = ServiceType.Ride);
}
