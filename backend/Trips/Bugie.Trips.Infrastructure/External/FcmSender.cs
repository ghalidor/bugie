using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Bugie.Trips.Domain.External;
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
    private readonly bool _ready;

    public FcmSender(
        ILogger<FcmSender> log,
        IAuthClient auth,
        IConfiguration cfg)
    {
        _log = log;
        _auth = auth;

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
        if(!_ready)
        {
            _log.LogDebug("FCM no listo; omitiendo envío.");
            return;
        }

        var ids = userIds?.Distinct().ToList() ?? new List<Guid>();
        if(ids.Count == 0) return;

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
            Data = BuildData(message),
            Android = new AndroidConfig
            {
                Priority = Priority.High,
                Notification = new AndroidNotification
                {
                    ChannelId = "bugie_high_priority",
                    Sound = "default",
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

            if(code == MessagingErrorCode.Unregistered ||
                code == MessagingErrorCode.InvalidArgument)
            {
                _log.LogInformation("Borrando token FCM muerto: {Code}", code);
                try { await _auth.DeleteFcmTokenAsync(deadToken, ct); }
                catch { /* no crítico */ }
            }
            else
            {
                _log.LogDebug("FCM falló para 1 token: {Code}", code);
            }
        }
    }

    /// <summary>
    /// Construye el payload de data del mensaje. Todos los valores deben ser
    /// string (es la regla de FCM). Incluimos siempre "route" para que el
    /// cliente sepa adónde navegar al tocar la notificación.
    /// </summary>
    private static Dictionary<string, string> BuildData(FcmPushMessage m)
    {
        var data = new Dictionary<string, string>();
        // Solo agregamos route si tiene valor (algunos eventos como cancelar
        // o rechazar no necesitan navegación al tocar la notif).
        if(!string.IsNullOrEmpty(m.Route))
            data["route"] = m.Route;
        if(m.ExtraData is not null)
        {
            foreach(var kv in m.ExtraData)
                data[kv.Key] = kv.Value;
        }
        return data;
    }
}