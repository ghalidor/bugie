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
    /// Notifica una nueva alerta SOS al admin y la guarda en el historial de
    /// avisos (campana, tipo 'sos'). userName/origen/destino solo sirven para
    /// el texto del aviso (pueden ser null). Nunca lanza excepción.
    /// </summary>
    Task NotifySosAsync(Guid tripId, Guid userId, string userRole,
                        double lat, double lng, Guid alertId, string? userName,
                        string? originAddress, string? destAddress,
                        CancellationToken ct = default);

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

    /// <summary>
    /// Avisa al admin de un cambio en una alerta de desvío de ruta.
    /// kind: "new" (se abrió), "closed" (volvió a la ruta o terminó el viaje)
    /// o "reviewed" (un admin la marcó como revisada).
    /// </summary>
    Task NotifyRouteDeviationAsync(Entities.RouteDeviation deviation, string kind,
                                   CancellationToken ct = default);
}
