using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
using System.Globalization;
using System.Text.Json;
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
    private readonly IAdminNotificationRepository _history;
    private readonly ILogger<SignalRAdminNotifier> _log;

    public SignalRAdminNotifier(IHubContext<MonitorHub> hub, IAdminNotificationRepository history,
                                ILogger<SignalRAdminNotifier> log)
    {
        _hub = hub;
        _history = history;
        _log = log;
    }

    /// <summary>
    /// Alerta SOS nueva: se guarda en el historial de avisos (tipo 'sos',
    /// link /admin/sos) y se empuja "sos:new" con notificationId, title y
    /// message. Permiso del aviso: "view:sos_center,view:live_map" (lo ve quien
    /// tenga cualquiera de los dos, igual que SosAdminController).
    /// Si guardar el aviso falla, igual se empuja el evento (notificationId null).
    /// </summary>
    public async Task NotifySosAsync(Guid tripId, Guid userId, string userRole,
                                      double lat, double lng, Guid alertId, string? userName,
                                      string? originAddress, string? destAddress,
                                      CancellationToken ct = default)
    {
        const string title = "Alerta SOS";
        var role = userRole == "driver" ? "conductor" : "pasajero";
        var who = string.IsNullOrWhiteSpace(userName)
            ? (userRole == "driver" ? "Un conductor" : "Un pasajero")
            : $"{userName.Trim()} ({role})";
        var route = !string.IsNullOrWhiteSpace(originAddress) && !string.IsNullOrWhiteSpace(destAddress)
            ? $" ({originAddress.Trim()} → {destAddress.Trim()})"
            : "";
        var message = $"{who} activó el botón SOS en el viaje {tripId.ToString()[..8]}{route}.";

        Guid? notificationId = null;
        try
        {
            var data = JsonSerializer.Serialize(new { tripId, alertId, userId, userRole });
            notificationId = await _history.AddAsync(
                "sos", title, message, "/admin/sos",
                "view:sos_center,view:live_map", data, ct);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo guardar el SOS en el historial de avisos (no crítico).");
        }

        try
        {
            await _hub.Clients.Group("admins").SendAsync("sos:new", new
            {
                notificationId,
                alertId,
                tripId,
                userId,
                userRole,
                userName,
                title,
                message,
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
    /// sin recargar toda la lista. Si viene tripId (viaje activo), el monitoreo
    /// agrega el punto al trazo del recorrido en vivo de ese viaje.
    /// </summary>
    public async Task NotifyDriverLocationAsync(Guid driverUserId, double lat, double lng,
                                                 bool hasActiveTrip, Guid? tripId = null,
                                                 double? heading = null, double? speedKmh = null,
                                                 CancellationToken ct = default)
    {
        try
        {
            await _hub.Clients.Group("admins").SendAsync("driver:location", new
            {
                userId = driverUserId,
                lat,
                lng,
                hasActiveTrip,
                tripId,
                heading,
                speedKmh,
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

    /// <summary>
    /// Alerta de desvío de ruta. Eventos: "deviation:new", "deviation:closed",
    /// "deviation:reviewed". El admin muestra la alerta destacada y la quita
    /// cuando alguien la revisa.
    /// "deviation:new" es además un aviso del Centro de avisos: se guarda en el
    /// historial (trips.adminnotifications, tipo 'deviation', permiso
    /// view:live_map, mismo texto que arma el panel) y el payload lleva
    /// notificationId. En closed/reviewed notificationId va null.
    /// </summary>
    public async Task NotifyRouteDeviationAsync(RouteDeviation d, string kind,
                                                CancellationToken ct = default)
    {
        Guid? notificationId = null;
        if(kind == "new")
        {
            try
            {
                var meters = Math.Round(d.DistanceM).ToString("N0", CultureInfo.InvariantCulture);
                var data = JsonSerializer.Serialize(new
                {
                    deviationId = d.Id,
                    tripId = d.TripId,
                    driverId = d.DriverId,
                    distanceM = Math.Round(d.DistanceM),
                });
                notificationId = await _history.AddAsync(
                    "deviation",
                    "Un conductor se desvió de la ruta",
                    $"Se alejó {meters} m de la ruta planificada.",
                    "/admin/monitoreo",
                    "view:live_map",
                    data, ct);
            }
            catch(Exception ex)
            {
                _log.LogWarning(ex, "No se pudo guardar el desvío en el historial de avisos (no crítico).");
            }
        }

        try
        {
            await _hub.Clients.Group("admins").SendAsync($"deviation:{kind}", new
            {
                notificationId,
                id = d.Id,
                tripId = d.TripId,
                driverId = d.DriverId,
                leg = d.Leg,
                lat = d.Lat,
                lng = d.Lng,
                distanceM = d.DistanceM,
                maxDistanceM = d.MaxDistanceM,
                status = d.Status,
                closeReason = d.CloseReason,
                startedAt = d.StartedAt,
                endedAt = d.EndedAt,
                reviewedAt = d.ReviewedAt,
                reviewNote = d.ReviewNote,
            }, ct);
            _log.LogInformation("SignalR: 'deviation:{Kind}' empujado. Trip={TripId}", kind, d.TripId);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo notificar desvío de ruta vía SignalR (no crítico).");
        }
    }
}
