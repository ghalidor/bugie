using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Bugie.Rewards.Domain.External;

namespace Bugie.Rewards.Infrastructure.External;

/// <summary>
/// Envia los push de Rewards (puntos por vencer/vencidos, pagos de Payments
/// via NotifyPayoutCommand) a traves de Trips:
///
///   POST {Services:TripsApi}api/internal/notify/push   (header X-Internal-Token)
///   Body: { userId, title, body, route, data }
///
/// Por que no manda directo a Firebase: Trips guarda cada push en la bandeja
/// de notificaciones del usuario (trips.usernotifications) y agrega
/// "notification_id" al data. Asi los avisos de Rewards y Payments tambien
/// aparecen en la bandeja. Es el mismo camino que usa Drivers (TripsNotifyClient).
/// La prioridad y el canal se conservan: el FcmSender de Trips usa la misma
/// configuracion que tenia este (prioridad alta, canal bugie_high_priority,
/// sonido default en Android e iOS).
///
/// Nunca lanza excepciones hacia arriba: un push que no salio no puede
/// romper el vencimiento de puntos ni el aviso de pago.
/// </summary>
public class FcmSender : IFcmSender
{
    private readonly HttpClient _http;
    private readonly TripsClientOptions _opt;
    private readonly ILogger<FcmSender> _log;

    public FcmSender(HttpClient http, IOptions<TripsClientOptions> opt, ILogger<FcmSender> log)
    {
        _http = http;
        _opt  = opt.Value;
        _log  = log;
    }

    public async Task SendToUserAsync(Guid userId, FcmPushMessage message, CancellationToken ct = default)
    {
        if (userId == Guid.Empty || string.IsNullOrWhiteSpace(message.Title)) return;

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "api/internal/notify/push");
            req.Headers.Add("X-Internal-Token", _opt.InternalToken);
            req.Content = JsonContent.Create(new
            {
                userId,
                title = message.Title,
                body  = message.Body,
                route = message.Route,
                data  = message.ExtraData,
            });

            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
                _log.LogWarning("Trips rechazo el push a {UserId}: {Status}",
                    userId, (int)res.StatusCode);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "No se pudo enviar el push a {UserId} via Trips.", userId);
        }
    }

    public async Task SendToUsersAsync(
        IEnumerable<Guid> userIds, FcmPushMessage message, CancellationToken ct = default)
    {
        // Uno por uno: el endpoint interno de Trips es por usuario.
        foreach (var id in userIds?.Distinct() ?? Enumerable.Empty<Guid>())
            await SendToUserAsync(id, message, ct);
    }
}
