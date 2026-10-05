using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

namespace Bugie.Trips.Infrastructure.External;

/// <summary>
/// Implementación REAL de IFcmSender usando FirebaseAdmin SDK.
///
/// Inicialización:
///   - Lee la ruta del service-account.json desde appsettings: Fcm:ServiceAccountPath
///     (default: "firebase-service-account.json").
///   - Si el archivo no existe, NO falla: deja FirebaseApp en null y los
///     envíos se vuelven no-op (loggean y siguen). Así la app arranca igual
///     en entornos sin Firebase configurado (dev local, tests, etc).
///
/// Flujo del envío:
///   1. Pide los tokens de los usuarios destino al módulo Auth (HTTP interno).
///   2. Construye un Message por cada token con title/body/data.
///   3. Manda en lote con SendEachAsync (más eficiente que uno por uno).
///   4. Si Firebase devuelve UNREGISTERED para algún token, lo borra de Auth
///      vía DELETE interno (token muerto: la app fue desinstalada o reseteada).
///
/// Errores que NO rompen flujo:
///   - Archivo de credenciales faltante.
///   - Network/timeout contra Firebase.
///   - Tokens individuales fallidos (los logueamos pero no propagamos).
///   El backend nunca debe romperse por un push que no se pudo entregar.
/// </summary>
public class FcmSender : IFcmSender
{
    private readonly ILogger<FcmSender> _log;
    private readonly IAuthClient _auth;
    private readonly IUserNotificationRepository _inbox;
    private readonly bool _ready;

    public FcmSender(
        ILogger<FcmSender> log,
        IAuthClient auth,
        IUserNotificationRepository inbox,
        IConfiguration cfg)
    {
        _log = log;
        _auth = auth;
        _inbox = inbox;

        // Inicialización idempotente: FirebaseApp.DefaultInstance es global,
        // si ya está creado no lo creamos otra vez.
        try
        {
            if(FirebaseApp.DefaultInstance is null)
            {
                var path = cfg["Fcm:ServiceAccountPath"] ?? "firebase-service-account.json";
                if(!File.Exists(path))
                {
                    _log.LogWarning(
                        "FCM deshabilitado: no se encontró el archivo {Path}. " +
                        "Los push notifications NO se enviarán.", path);
                    _ready = false;
                    return;
                }
                FirebaseApp.Create(new AppOptions
                {
                    Credential = GoogleCredential.FromFile(path),
                });
            }
            _ready = true;
            _log.LogInformation("FCM inicializado correctamente.");
        }
        catch(Exception ex)
        {
            _log.LogError(ex, "FCM init falló — push deshabilitados.");
            _ready = false;
        }
    }

    public Task SendToUserAsync(Guid userId, FcmPushMessage message, CancellationToken ct = default)
        => SendToUsersAsync(new[] { userId }, message, ct);

    public async Task SendToUsersAsync(
        IEnumerable<Guid> userIds, FcmPushMessage message, CancellationToken ct = default)
    {
        var ids = userIds?.Distinct().ToList() ?? new List<Guid>();
        if(ids.Count == 0) return;

        // 0. Bandeja: se guarda SIEMPRE (aunque FCM no esté listo o el usuario
        //    no tenga tokens), así la app muestra el aviso en "Notificaciones".
        var notificationIds = await SaveToInboxAsync(ids, message);

        if(!_ready)
        {
            _log.LogDebug("FCM no listo; omitiendo envío.");
            return;
        }

        // 1. Traer los tokens de Auth.
        List<FcmTokenInfo> tokens;
        try
        {
            tokens = await _auth.GetFcmTokensAsync(ids, ct);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudieron obtener tokens FCM.");
            return;
        }

        if(tokens.Count == 0) return;

        // Solicitudes nuevas al conductor y propuestas/contraofertas al pasajero
        // van por el canal "bugie_requests" (sonido propio, vibración insistente).
        // Misma regla que isRequestChannelPush() en la app (fcm_service.dart).
        var isRequest = IsRequestPush(message);
        var channelId = isRequest ? "bugie_requests" : "bugie_high_priority";
        var sound     = isRequest ? "bugie_request" : "default";

        // 2. Armar un Message por token.
        var messages = tokens.Select(t => new Message
        {
            Token = t.Token,
            Notification = new Notification
            {
                Title = message.Title,
                Body = message.Body,
            },
            // Data llega como Map<String,String> al lado Flutter.
            // El cliente lee "route" al tocar la notif para navegar.
            Data = BuildData(message,
                notificationIds.TryGetValue(t.UserId, out var nid) ? nid : null),
            Android = new AndroidConfig
            {
                Priority = Priority.High,
                Notification = new AndroidNotification
                {
                    ChannelId = channelId,
                    Sound = sound,
                },
            },
            Apns = new ApnsConfig
            {
                Aps = new Aps { Sound = "default", ContentAvailable = true },
            },
        }).ToList();

        // 3. Enviar en lote.
        BatchResponse response;
        try
        {
            response = await FirebaseMessaging.DefaultInstance.SendEachAsync(messages, ct);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "Fallo al enviar push (lote completo).");
            return;
        }

        _log.LogInformation(
            "FCM envió {Success}/{Total} (route={Route})",
            response.SuccessCount, messages.Count, message.Route);

        // 4. Limpiar tokens muertos (UNREGISTERED / INVALID_ARGUMENT).
        for(int i = 0; i < response.Responses.Count; i++)
        {
            var r = response.Responses[i];
            if(r.IsSuccess) continue;

            var code = r.Exception?.MessagingErrorCode;
            var deadToken = messages[i].Token;

            var detail = r.Exception?.Message ?? "";
            // InvalidArgument también sale cuando el MENSAJE es inválido (no el token):
            // solo se borra el token si FCM dice que el token no es válido.
            var tokenInvalid = code == MessagingErrorCode.Unregistered ||
                (code == MessagingErrorCode.InvalidArgument &&
                 detail.Contains("registration token", StringComparison.OrdinalIgnoreCase));
            if(tokenInvalid)
            {
                _log.LogInformation("Borrando token FCM muerto: {Code} ({Detail})", code, detail);
                try { await _auth.DeleteFcmTokenAsync(deadToken, ct); }
                catch { /* no crítico */ }
            }
            else
            {
                _log.LogWarning("FCM falló para 1 token: {Code} ({Detail})", code, detail);
            }
        }
    }

    /// <summary>
    /// Construye el payload de data del mensaje. Todos los valores deben ser
    /// string (es la regla de FCM). Incluimos siempre "route" para que el
    /// cliente sepa adónde navegar al tocar la notificación.
    /// </summary>
    /// <summary>¿Es una solicitud nueva o una propuesta? (canal de solicitudes).</summary>
    private static bool IsRequestPush(FcmPushMessage m)
    {
        string? type = null, alertType = null;
        if(m.ExtraData is not null)
        {
            m.ExtraData.TryGetValue("type", out type);
            m.ExtraData.TryGetValue("alert_type", out alertType);
        }
        if(type == "new_request") return true;
        if(m.Route == "/driver/requests" && string.IsNullOrEmpty(type)) return true;
        return alertType == "proposal" && !string.IsNullOrEmpty(m.Route);
    }

    /// <summary>
    /// FCM rechaza el mensaje entero (InvalidArgument) si data usa claves reservadas:
    /// "from", "notification", "message_type" o las que empiezan con "google."/"gcm.".
    /// "from" (quién envía: driver/passenger) viaja como "from_role"; la app lee ambas.
    /// </summary>
    private static string SafeKey(string key) => key switch
    {
        "from" => "from_role",
        "notification" => "notification_data",
        "message_type" => "msg_type",
        _ when key.StartsWith("google.") || key.StartsWith("gcm.") => "x_" + key.Replace('.', '_'),
        _ => key,
    };

    private static Dictionary<string, string> BuildData(FcmPushMessage m, Guid? notificationId = null)
    {
        var data = new Dictionary<string, string>();
        // Solo agregamos route si tiene valor (algunos eventos como cancelar
        // o rechazar no necesitan navegación al tocar la notif).
        if(!string.IsNullOrEmpty(m.Route))
            data["route"] = m.Route;
        if(m.ExtraData is not null)
        {
            foreach(var kv in m.ExtraData)
                data[SafeKey(kv.Key)] = kv.Value;
        }
        // Id de la fila de la bandeja: la app la marca leída al tocar el aviso.
        if(notificationId.HasValue)
            data["notification_id"] = notificationId.Value.ToString();
        return data;
    }

    /// <summary>
    /// Guarda el aviso en la bandeja (trips.usernotifications), una fila por
    /// usuario. Solo los avisos visibles: sin título no se guarda (un push de
    /// solo datos no es un aviso para el usuario). De data se separan type,
    /// alert_type y route; el resto queda en la columna Data (JSON).
    /// Devuelve userId -> id de la notificación. Si falla, no rompe el envío.
    /// </summary>
    private async Task<Dictionary<Guid, Guid>> SaveToInboxAsync(List<Guid> ids, FcmPushMessage m)
    {
        if(string.IsNullOrWhiteSpace(m.Title)) return new Dictionary<Guid, Guid>();
        try
        {
            string? type = null, alertType = null, route = m.Route;
            var rest = new Dictionary<string, string>();
            if(m.ExtraData is not null)
            {
                foreach(var kv in m.ExtraData)
                {
                    switch(kv.Key)
                    {
                        case "type": type = kv.Value; break;
                        case "alert_type": alertType = kv.Value; break;
                        case "route": if(string.IsNullOrEmpty(route)) route = kv.Value; break;
                        case "notification_id": break;
                        default: rest[kv.Key] = kv.Value; break;
                    }
                }
            }
            var dataJson = rest.Count > 0 ? System.Text.Json.JsonSerializer.Serialize(rest) : null;

            // CancellationToken.None: el aviso debe quedar guardado aunque se
            // cancele el request que lo disparó.
            return await _inbox.AddForUsersAsync(ids, m.Title, m.Body ?? "",
                type, alertType, string.IsNullOrEmpty(route) ? null : route, dataJson,
                CancellationToken.None);
        }
        catch(Exception ex)
        {
            _log.LogWarning(ex, "No se pudo guardar el aviso en la bandeja.");
            return new Dictionary<Guid, Guid>();
        }
    }
}