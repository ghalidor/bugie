using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Bugie.Trips.Api.Realtime;

/// <summary>
/// Hub SignalR para notificaciones en vivo al panel admin.
/// Endpoint: /hubs/monitor (montado en Program.cs).
///
/// Solo admins pueden conectarse (Authorize role admin).
///
/// Eventos emitidos al grupo "admins":
///   - "sos:new"           — alerta SOS nueva
///   - "driver:location"   — un conductor reportó nueva posición
///   - "passenger:location"— un pasajero (en viaje) reportó nueva posición
///   - "driver:offline"    — un conductor se desconectó (no más broadcasts)
///   - "deviation:new" / "deviation:closed" / "deviation:reviewed"
///                         — alerta de desvío de ruta (detectada en el backend)
///   - "monitor:alert" / "monitor:alert-resolved"
///                         — alertas sin señal, detenido y viaje demorado
///                           (MonitorAlertsService, cada 30 s)
///
/// Estrategia: al conectarse, el admin se agrega automáticamente al grupo
/// "admins" en OnConnectedAsync. Al desconectarse, se remueve.
/// </summary>
[Authorize(Roles = "admin")]
public class MonitorHub : Hub
{
    private readonly ILogger<MonitorHub> _log;

    public MonitorHub(ILogger<MonitorHub> log) => _log = log;

    /// <summary>
    /// Al conectar, el admin se une al grupo "admins" para recibir broadcasts.
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, "admins");
        _log.LogInformation("MonitorHub: admin conectado ({ConnId})", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    /// <summary>
    /// Al desconectar, se remueve del grupo (SignalR lo hace automático en
    /// algunos casos pero lo explicitamos para claridad).
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, "admins");
        _log.LogInformation("MonitorHub: admin desconectado ({ConnId})", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
