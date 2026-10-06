namespace Bugie.Drivers.Domain.External;

/// <summary>
/// Cliente abstracto para notificar a Trips.Api (que tiene el SignalR Hub)
/// cuando pasan cosas relevantes en Drivers (GPS, offline, etc.).
///
/// La interface vive en Domain para respetar la arquitectura cebolla:
/// Application puede inyectarla sin depender de Infrastructure. La
/// implementación concreta (HTTP fire-and-forget) está en Infrastructure.
///
/// Es "best effort": si Trips está caído, nada falla — solo el broadcast
/// no llega. Los datos siguen guardados correctamente en BD de Drivers,
/// y el admin tiene polling de respaldo.
/// </summary>
public interface ITripsNotifyClient
{
    /// <summary>
    /// Notifica nueva posición GPS del conductor vía SignalR (Trips.Api): al admin y,
    /// si tiene viaje activo, al pasajero de ese viaje. speedKmh y heading son
    /// opcionales (solo los usa el pasajero para orientar el ícono del auto).
    /// </summary>
    Task NotifyDriverLocationAsync(Guid userId, double lat, double lng,
                                    bool hasActiveTrip, double? speedKmh = null, double? heading = null,
                                    CancellationToken ct = default);

    /// <summary>
    /// Igual que NotifyDriverLocationAsync pero con varios puntos (de uno o varios
    /// conductores) en UNA sola llamada: POST api/internal/notify/driver-locations.
    /// Lo usa el LocationWriterService en segundo plano. Nunca lanza excepcion.
    /// </summary>
    Task NotifyDriverLocationsAsync(IReadOnlyList<DriverLocationNotice> points,
                                     CancellationToken ct = default);

    /// <summary>Notifica que el conductor se puso offline (sacar pin del mapa).</summary>
    Task NotifyDriverOfflineAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Push FCM a un usuario vía Trips.Api (POST api/internal/notify/push).
    /// Nunca lanza excepción: si falla, solo se registra en el log.
    /// </summary>
    Task SendPushAsync(Guid userId, string title, string body,
                       IReadOnlyDictionary<string, string>? data = null,
                       CancellationToken ct = default);
}
