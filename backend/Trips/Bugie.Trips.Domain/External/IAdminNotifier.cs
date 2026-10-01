namespace Bugie.Trips.Domain.External;

/// <summary>
/// Servicio externo que notifica eventos en tiempo real al panel admin
/// y a otros usuarios (conductores, pasajeros) vía SignalR.
///
/// La implementación concreta usa SignalR (en Bugie.Trips.Api), pero esta
/// abstracción vive en Domain para que los handlers de Application puedan
/// dispararlo sin depender de SignalR directamente.
///
/// Si no hay clientes conectados, los métodos no fallan — solo no entregan
/// a nadie. SignalR es "best effort": los datos siempre están en BD, esto
/// es solo para reducir latencia en la UI.
/// </summary>
public interface IAdminNotifier
{
    /// <summary>
    /// Notifica una nueva alerta SOS al admin.
    /// </summary>
    Task NotifySosAsync(Guid tripId, Guid userId, string userRole,
                        double lat, double lng, CancellationToken ct = default);

    /// <summary>
    /// Empuja la nueva posición GPS de un conductor a TODOS los admins
    /// conectados al monitoreo. Reemplaza la necesidad de poll para esta
    /// actualización puntual. El admin recibe {userId, lat, lng, hasActiveTrip}.
    /// </summary>
    Task NotifyDriverLocationAsync(Guid driverUserId, double lat, double lng,
                                    bool hasActiveTrip, CancellationToken ct = default);

    /// <summary>
    /// Empuja la nueva posición GPS de un pasajero (durante viaje) a los
    /// admins. Solo se llama si el pasajero tiene un viaje activo y reporta
    /// ubicación. Para pasajeros sin viaje no hay broadcast.
    /// </summary>
    Task NotifyPassengerLocationAsync(Guid passengerUserId, Guid tripId,
                                      double lat, double lng, CancellationToken ct = default);

    /// <summary>
    /// Notifica que un conductor se desconectó (no más broadcasts de su
    /// ubicación). El admin debería sacarlo del mapa o marcarlo gris.
    /// </summary>
    Task NotifyDriverOfflineAsync(Guid driverUserId, CancellationToken ct = default);
}
