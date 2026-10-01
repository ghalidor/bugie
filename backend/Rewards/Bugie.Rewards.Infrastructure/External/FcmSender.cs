using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Bugie.Rewards.Domain.External;

namespace Bugie.Rewards.Infrastructure.External;

/// <summary>
/// Envia push por Firebase. Es el mismo patron que Trips.Infrastructure/FcmSender:
///
///   - Lee el service-account desde Fcm:ServiceAccountPath.
///   - Si el archivo no esta, NO falla: los envios quedan en nada y se loguean.
///     Asi el vencimiento de puntos funciona igual en un entorno sin Firebase.
///   - Pide los tokens a Auth por HTTP interno.
///   - Si Firebase dice UNREGISTERED, borra el token muerto en Auth.
///
/// Por que esta duplicado y no compartido con Trips: cada modulo es
/// independiente y no comparte codigo con los demas. Es el costo de que puedas
/// desplegar y actualizar Rewards sin tocar Trips.
/// </summary>
public class FcmSender : IFcmSender
{
    // La inicializacion de Firebase es global al proceso, no por instancia.
    // Se hace una sola vez aunque el servicio se registre como Scoped, y asi
    // el warning de "falta el archivo" tampoco se repite en cada request.
    private static readonly object _initLock = new();
    private static bool _initialized;
    private static bool _available;

    private readonly ILogger<FcmSender> _log;
    private readonly IAuthTokensClient  _auth;

    public FcmSender(ILogger<FcmSender> log, IAuthTokensClient auth, IConfiguration cfg)
    {
        _log  = log;
        _auth = auth;
        EnsureInitialized(cfg, log);
    }

    private static void EnsureInitialized(IConfiguration cfg, ILogger log)
    {
        if (_initialized) return;

        lock (_initLock)
        {
            if (_initialized) return;
            _initialized = true;

            try
            {
                if (FirebaseApp.DefaultInstance is null)
                {
                    var path = cfg["Fcm:ServiceAccountPath"] ?? "firebase-service-account.json";
                    if (!File.Exists(path))
                    {
                        log.LogWarning(
                            "FCM deshabilitado: no se encontro {Path}. Los avisos de puntos NO se enviaran.",
                            path);
                        _available = false;
                        return;
                    }

                    FirebaseApp.Create(new AppOptions
                    {
                        Credential = GoogleCredential.FromFile(path),
                    });
                }

                _available = true;
                log.LogInformation("FCM inicializado en Rewards.");
            }
            catch (Exception ex)
            {
                log.LogError(ex, "FCM no pudo inicializarse. Los push quedan deshabilitados.");
                _available = false;
            }
        }
    }

    public Task SendToUserAsync(Guid userId, FcmPushMessage message, CancellationToken ct = default)
        => SendToUsersAsync(new[] { userId }, message, ct);

    public async Task SendToUsersAsync(
        IEnumerable<Guid> userIds, FcmPushMessage message, CancellationToken ct = default)
    {
        if (!_available) return;

        var ids = userIds?.Distinct().ToList() ?? new List<Guid>();
        if (ids.Count == 0) return;

        try
        {
            var tokens = await _auth.GetTokensAsync(ids, ct);
            if (tokens.Count == 0) return;

            var data = new Dictionary<string, string>();
            if (!string.IsNullOrWhiteSpace(message.Route)) data["route"] = message.Route!;
            if (message.ExtraData is not null)
                foreach (var kv in message.ExtraData) data[kv.Key] = kv.Value;

            var messages = tokens.Select(t => new Message
            {
                Token        = t.Token,
                Notification = new Notification { Title = message.Title, Body = message.Body },
                Data         = data,
            }).ToList();

            var response = await FirebaseMessaging.DefaultInstance.SendEachAsync(messages, ct);

            if (response.FailureCount == 0) return;

            // Limpiar tokens muertos para no seguir intentando con ellos.
            for (var i = 0; i < response.Responses.Count; i++)
            {
                var r = response.Responses[i];
                if (r.IsSuccess) continue;

                var code = r.Exception?.MessagingErrorCode;
                if (code is MessagingErrorCode.Unregistered or MessagingErrorCode.InvalidArgument)
                    await _auth.DeleteTokenAsync(tokens[i].Token, ct);
            }

            _log.LogInformation(
                "Push enviados: {Ok} ok, {Fail} fallidos.",
                response.SuccessCount, response.FailureCount);
        }
        catch (Exception ex)
        {
            // Un push que no salio nunca debe romper el proceso que lo llamo.
            _log.LogWarning(ex, "Error enviando push desde Rewards.");
        }
    }
}
