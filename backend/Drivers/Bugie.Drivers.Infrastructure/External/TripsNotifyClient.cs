using System.Net.Http.Json;
using Bugie.Drivers.Domain.External;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Bugie.Drivers.Infrastructure.External;

/// <summary>
/// Implementación HTTP del cliente que notifica a Trips.Api (donde vive el
/// SignalR Hub) cuando un conductor reporta GPS u offline.
///
/// Diseñado para "best effort" / fire-and-forget:
///   - Si Trips está caído, nada falla — solo el broadcast no llega.
///   - Los datos siguen guardados correctamente en BD de Drivers.
///   - El admin tiene polling de 30s como red de seguridad.
///   - Si HttpClient da timeout (configurado a 3s), también ignoramos.
///
/// La URL base se toma de appsettings: Services:TripsApi.
/// El token interno se valida en el lado de Trips antes de aceptar el broadcast.
/// </summary>
public class TripsNotifyClient : ITripsNotifyClient
{
    private readonly HttpClient _http;
    private readonly IConfiguration _cfg;
    private readonly ILogger<TripsNotifyClient> _log;

    public TripsNotifyClient(HttpClient http, IConfiguration cfg, ILogger<TripsNotifyClient> log)
    {
        _http = http;
        _cfg = cfg;
        _log = log;
    }

    public async Task NotifyDriverLocationAsync(Guid userId, double lat, double lng,
                                                  bool hasActiveTrip, double? speedKmh = null, double? heading = null,
                                                  CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post,
                "api/internal/notify/driver-location");
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
            req.Content = JsonContent.Create(new { userId, lat, lng, hasActiveTrip, speedKmh, heading });

            // Timeout corto: si Trips no responde en 3s, asumimos que está
            // caído y seguimos. No queremos bloquear la respuesta al conductor
            // por culpa del broadcast.
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            using var res = await _http.SendAsync(req, cts.Token);
            if(!res.IsSuccessStatusCode)
            {
                _log.LogWarning("Trips rechazó driver-location: {Status}", res.StatusCode);
            }
        }
        catch(OperationCanceledException)
        {
            // Timeout esperado — no es un error, solo no llegó la notificación.
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "NotifyDriverLocationAsync falló (no crítico).");
        }
    }

    public async Task NotifyDriverLocationsAsync(IReadOnlyList<DriverLocationNotice> points,
                                                   CancellationToken ct = default)
    {
        if(points.Count == 0) return;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post,
                "api/internal/notify/driver-locations");
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
            req.Content = JsonContent.Create(new
            {
                points = points.Select(p => new
                {
                    userId = p.UserId, lat = p.Lat, lng = p.Lng, hasActiveTrip = p.HasActiveTrip,
                    speedKmh = p.SpeedKmh, heading = p.Heading, at = p.At,
                }),
            });

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(5));

            using var res = await _http.SendAsync(req, cts.Token);
            if(!res.IsSuccessStatusCode)
                _log.LogWarning("Trips rechazo driver-locations ({Count} puntos): {Status}", points.Count, res.StatusCode);
        }
        catch(OperationCanceledException)
        {
            // Timeout: Trips lento o caido. El GPS ya esta en memoria/BD.
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "NotifyDriverLocationsAsync fallo (no critico).");
        }
    }

    public async Task NotifyDriverOfflineAsync(Guid userId, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post,
                "api/internal/notify/driver-offline");
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
            req.Content = JsonContent.Create(new { userId });

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            await _http.SendAsync(req, cts.Token);
        }
        catch
        {
            // Silenciamos todo aquí — offline notification no es crítica.
        }
    }
    public async Task SendPushAsync(Guid userId, string title, string body,
                                    IReadOnlyDictionary<string, string>? data = null,
                                    CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "api/internal/notify/push");
            req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
            // "route" viaja también dentro de data; Trips lo pone en el mensaje.
            string? route = null;
            data?.TryGetValue("route", out route);
            req.Content = JsonContent.Create(new { userId, title, body, route, data });

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            using var res = await _http.SendAsync(req, cts.Token);
            if(!res.IsSuccessStatusCode)
                _log.LogWarning("Trips rechazó push a {UserId}: {Status}", userId, res.StatusCode);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "SendPushAsync a {UserId} falló (no crítico).", userId);
        }
    }
}
