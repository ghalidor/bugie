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
/// </summary>
public interface ITripNotificationService
{
    /// <summary>
    /// El pasajero aceptó la propuesta del conductor. Falta que el conductor
    /// confirme para iniciar el viaje.
    /// → Push al CONDUCTOR.
    /// </summary>
    Task NotifyDriverPassengerAcceptedAsync(
        Guid driverUserId, Guid tripId, decimal fare);

    /// <summary>
    /// El conductor confirmó la aceptación. Viaje en curso.
    /// → Push al PASAJERO.
    /// </summary>
    Task NotifyPassengerDriverConfirmedAsync(
        Guid passengerUserId, Guid tripId);

    /// <summary>
    /// El pasajero envió una contrapropuesta a un conductor específico.
    /// → Push al CONDUCTOR.
    /// </summary>
    Task NotifyDriverPassengerCounterAsync(
        Guid driverUserId, Guid tripId, decimal fare);

    /// <summary>
    /// El conductor envió una propuesta (o contrapropuesta) al pasajero.
    /// → Push al PASAJERO.
    /// </summary>
    Task NotifyPassengerDriverProposeAsync(
        Guid passengerUserId, Guid tripId, decimal fare);

    /// <summary>
    /// El conductor inició el viaje. El pasajero debe estar en el punto.
    /// → Push al PASAJERO.
    /// </summary>
    Task NotifyPassengerTripStartedAsync(
        Guid passengerUserId, Guid tripId);

    /// <summary>
    /// El conductor avisa que ya esta en el punto de recojo.
    /// → Push al PASAJERO (la app muestra un aviso emergente).
    /// </summary>
    Task NotifyPassengerDriverArrivedAsync(
        Guid passengerUserId, Guid tripId);

    /// <summary>
    /// El conductor o pasajero canceló el viaje.
    /// → Push a la CONTRAPARTE.
    /// </summary>
    Task NotifyTripCancelledAsync(
        Guid recipientUserId, Guid tripId, string cancelledByRole);

    /// <summary>
    /// El pasajero rechazó la propuesta del conductor.
    /// → Push al CONDUCTOR.
    /// </summary>
    Task NotifyDriverProposalRejectedAsync(
        Guid driverUserId, Guid tripId);
}