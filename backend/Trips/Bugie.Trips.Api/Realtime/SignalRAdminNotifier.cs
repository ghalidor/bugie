using Bugie.Trips.Domain.External;
using Microsoft.AspNetCore.SignalR;

namespace Bugie.Trips.Api.Realtime;

/// <summary>
/// Implementación de IAdminNotifier que usa SignalR para empujar eventos
/// al hub MonitorHub. Si no hay clientes conectados, SendAsync no falla.
///
/// Estrategia de broadcast:
///   - SOS y posiciones GPS → Group("admins"). Los admins se unen automáticamente
///     al hacer connect porque el hub tiene [Authorize(Roles = "admin")].
///   - Para no spammear, las posiciones SOLO se empujan si el conductor está
///     online (lo que llega al endpoint /drivers/me/location).
///
/// Tolerante a fallos: cualquier excepción se loguea pero no propaga. El admin
/// siempre tiene un fallback con polling de 10-60s para no perderse cambios.
/// </summary>
public class SignalRAdminNotifier : IAdminNotifier
{
    private readonly IHubContext<MonitorHub> _hub;
    private readonly ILogger<SignalRAdminNotifier> _log;

    public SignalRAdminNotifier(IHubContext<MonitorHub> hub, ILogger<SignalRAdminNotifier> log)
    {
        _hub = hub;
        _log = log;
    }

    public async Task NotifySosAsync(Guid tripId, Guid userId, string userRole,
                                      double lat, double lng, CancellationToken ct = default)
    {
        try
        {
            await _hub.Clients.Group("admins").SendAsync("sos:new", new
            {
                tripId,
                userId,
                userRole,
                lat,
                lng,
                createdAt = DateTime.UtcNow,
            }, ct);
            _log.LogInformation("SignalR: 'sos:new' empujado. Trip={TripId}", tripId);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo notificar SOS vía SignalR (no crítico).");
        }
    }

    /// <summary>
    /// Broadcast de nueva posición GPS de conductor al grupo "admins".
    /// Cada admin actualizará solo el pin de ese conductor en su mapa,
    /// sin recargar toda la lista.
    /// </summary>
    public async Task NotifyDriverLocationAsync(Guid driverUserId, double lat, double lng,
                                                 bool hasActiveTrip, CancellationToken ct = default)
    {
        try
        {
            await _hub.Clients.Group("admins").SendAsync("driver:location", new
            {
                userId = driverUserId,
                lat,
                lng,
                hasActiveTrip,
                at = DateTime.UtcNow,
            }, ct);
            // Evitamos log a nivel Information aquí — esto se llama 1 vez/10s
            // por conductor. Con 5000 conductores serían 500 logs/s.
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo notificar posición de conductor.");
        }
    }

    /// <summary>
    /// Broadcast de nueva posición GPS de pasajero (durante viaje) al grupo
    /// "admins". Solo se llama si el pasajero tiene viaje activo.
    /// </summary>
    public async Task NotifyPassengerLocationAsync(Guid passengerUserId, Guid tripId,
                                                    double lat, double lng, CancellationToken ct = default)
    {
        try
        {
            await _hub.Clients.Group("admins").SendAsync("passenger:location", new
            {
                userId = passengerUserId,
                tripId,
                lat,
                lng,
                at = DateTime.UtcNow,
            }, ct);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo notificar posición de pasajero.");
        }
    }

    /// <summary>
    /// Notifica al admin que un conductor se desconectó.
    /// El admin sacará su pin del mapa.
    /// </summary>
    public async Task NotifyDriverOfflineAsync(Guid driverUserId, CancellationToken ct = default)
    {
        try
        {
            await _hub.Clients.Group("admins").SendAsync("driver:offline", new
            {
                userId = driverUserId,
                at = DateTime.UtcNow,
            }, ct);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo notificar offline de conductor.");
        }
    }
}
