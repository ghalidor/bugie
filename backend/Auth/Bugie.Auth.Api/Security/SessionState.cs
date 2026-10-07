// =============================================================================
// MISMO ARCHIVO en las 6 APIs (Auth, Drivers, Trips, Payments, Landing, Rewards):
//   Bugie.<X>.Api/Security/SessionState.cs
// Si lo cambias, copialo identico a las otras 5.
// =============================================================================
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

namespace Bugie.Security;

/// <summary>
/// Cierre de sesiones: en cada request autenticado se compara el claim "sst"
/// del JWT con el sello de seguridad vigente de la cuenta (auth.users.securitystamp).
///
/// Reglas (SessionValidation.Evaluate):
///   - Cuenta inexistente o sello distinto        -> 401 code "session_revoked".
///   - Cuenta eliminada                           -> 401 code "account_deleted".
///   - Cuenta desactivada por el admin            -> 401 code "account_deactivated".
///   - Token antiguo SIN claim "sst" (emitido antes de este cambio): vale solo
///     si el sello de la cuenta nunca se cambio (stampRotated = false). Asi el
///     despliegue no saca a nadie; esos tokens vencen solos (Jwt:ExpiryHours).
///   Cuerpo del 401: { error: "...", code: "..." }. Los clientes (admin, web,
///   app) cierran la sesion local y muestran el mensaje.
///
/// De donde sale el estado de la cuenta:
///   - Auth: lectura directa de la BD en cada request (LocalSessionStateSource).
///   - Resto: GET {Services:AuthApi}/api/internal/users/{userId}/session-state
///     con X-Internal-Token, cacheado en memoria por usuario
///     (SessionState:CacheSeconds, por defecto 30 s). Si el sello cacheado no
///     coincide se vuelve a pedir una vez (el usuario pudo cambiar su
///     contrasena y recibir un token nuevo hace segundos).
///   - Si Auth no responde: se DEJA PASAR y se registra en el log (no se tumba
///     todo el sistema por una caida de Auth; el resto de validaciones del JWT
///     siguen: firma, emisor, audiencia y vencimiento).
/// </summary>
public static class SessionValidation
{
    public const string StampClaim = "sst";

    public const string CodeSessionRevoked = "session_revoked";
    public const string CodeAccountDeleted = "account_deleted";
    public const string CodeAccountDeactivated = "account_deactivated";

    public const string SessionClosedMessage = "Tu sesión se cerró. Vuelve a iniciar sesión.";
    public const string DeactivatedMessage = "Tu cuenta fue desactivada. Contacta a soporte.";
    public const string DeletedMessage = "Esta cuenta fue eliminada. Si quieres recuperarla, contacta a soporte.";

    private const string ItemsKey = "bugie:session-problem";

    /// <summary>null = la sesion vale; si no, el motivo del 401.</summary>
    public static SessionProblem? Evaluate(SessionLookup lookup, string? stampClaim)
    {
        if (lookup.Status == SessionLookupStatus.NotFound || lookup.State is null)
            return new SessionProblem(CodeSessionRevoked, SessionClosedMessage);

        var s = lookup.State;
        if (s.IsDeleted) return new SessionProblem(CodeAccountDeleted, DeletedMessage);
        if (s.IsDeactivated) return new SessionProblem(CodeAccountDeactivated, DeactivatedMessage);

        if (string.IsNullOrWhiteSpace(stampClaim))
            return s.StampRotated ? new SessionProblem(CodeSessionRevoked, SessionClosedMessage) : null;

        return Guid.TryParse(stampClaim, out var stamp) && stamp == s.Stamp
            ? null
            : new SessionProblem(CodeSessionRevoked, SessionClosedMessage);
    }

    /// <summary>
    /// Engancha la validacion a los eventos del JwtBearer (respetando los que
    /// ya hubiera, p.ej. el access_token de SignalR). Llamar al final de AddJwtBearer.
    /// </summary>
    public static void Configure(JwtBearerOptions options)
    {
        var events = options.Events ?? new JwtBearerEvents();
        var previousValidated = events.OnTokenValidated;
        var previousChallenge = events.OnChallenge;

        events.OnTokenValidated = async ctx =>
        {
            await previousValidated(ctx);
            if (ctx.Result is not null) return;   // otro handler ya decidio
            await ValidateAsync(ctx);
        };

        events.OnChallenge = async ctx =>
        {
            if (ctx.HttpContext.Items.TryGetValue(ItemsKey, out var v) && v is SessionProblem problem)
            {
                ctx.HandleResponse();
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                ctx.Response.ContentType = "application/json";
                await ctx.Response.WriteAsync(JsonSerializer.Serialize(new { error = problem.Message, code = problem.Code }));
                return;
            }
            await previousChallenge(ctx);
        };

        options.Events = events;
    }

    private static async Task ValidateAsync(TokenValidatedContext ctx)
    {
        var principal = ctx.Principal;
        var raw = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? principal?.FindFirst("sub")?.Value;
        if (!Guid.TryParse(raw, out var userId)) return;

        var http = ctx.HttpContext;
        var source = http.RequestServices.GetService<ISessionStateSource>();
        if (source is null) return;

        var stampClaim = principal?.FindFirst(StampClaim)?.Value;
        var ct = http.RequestAborted;

        var lookup = await source.GetAsync(userId, bypassCache: false, ct);
        if (lookup.Status == SessionLookupStatus.Unavailable)
        {
            LogUnavailable(http, userId);
            return;
        }

        var problem = Evaluate(lookup, stampClaim);
        // Dato cacheado que no coincide: puede ser viejo (contrasena recien
        // cambiada, cuenta recien reactivada). Se confirma con Auth una vez.
        if (problem is not null && lookup.FromCache && DateTime.UtcNow - lookup.FetchedAtUtc > TimeSpan.FromSeconds(2))
        {
            lookup = await source.GetAsync(userId, bypassCache: true, ct);
            if (lookup.Status == SessionLookupStatus.Unavailable)
            {
                LogUnavailable(http, userId);
                return;
            }
            problem = Evaluate(lookup, stampClaim);
        }

        if (problem is null) return;
        http.Items[ItemsKey] = problem;
        ctx.Fail(problem.Message);
    }

    private static void LogUnavailable(HttpContext http, Guid userId) =>
        http.RequestServices.GetService<ILoggerFactory>()?.CreateLogger("Bugie.Security.SessionValidation")
            .LogWarning("Sesion: no se pudo verificar el sello de {UserId} (Auth no respondio). Se deja pasar.", userId);

    /// <summary>Registra la fuente HTTP (Auth interno + cache). Auth registra la suya propia.</summary>
    public static IServiceCollection AddBugieSessionStateFromAuth(this IServiceCollection services)
    {
        services.AddMemoryCache();
        services.AddHttpClient();
        services.TryAddSingleton<ISessionStateSource, HttpSessionStateSource>();
        return services;
    }
}

public sealed record SessionProblem(string Code, string Message);

/// <summary>Estado de la cuenta para validar la sesion (respuesta del endpoint interno).</summary>
public sealed record SessionStateInfo(
    Guid UserId, Guid Stamp, bool StampRotated, bool IsDeleted, bool IsDeactivated, bool IsActive, string? Role);

public enum SessionLookupStatus { Found, NotFound, Unavailable }

public sealed record SessionLookup(SessionLookupStatus Status, SessionStateInfo? State, DateTime FetchedAtUtc, bool FromCache)
{
    public static SessionLookup Unavailable() => new(SessionLookupStatus.Unavailable, null, DateTime.UtcNow, false);
}

/// <summary>Fuente del estado de sesion. Nunca lanza: si falla devuelve Unavailable.</summary>
public interface ISessionStateSource
{
    Task<SessionLookup> GetAsync(Guid userId, bool bypassCache, CancellationToken ct);
}

/// <summary>
/// Pide el estado a Auth (endpoint interno) y lo guarda en memoria unos
/// segundos por usuario. Solo se cachean respuestas correctas (200 y 404).
/// </summary>
public sealed class HttpSessionStateSource : ISessionStateSource
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly IMemoryCache _cache;
    private readonly ILogger<HttpSessionStateSource> _log;

    public HttpSessionStateSource(IHttpClientFactory http, IConfiguration cfg, IMemoryCache cache,
                                  ILogger<HttpSessionStateSource> log)
    {
        _http = http;
        _cfg = cfg;
        _cache = cache;
        _log = log;
    }

    public async Task<SessionLookup> GetAsync(Guid userId, bool bypassCache, CancellationToken ct)
    {
        var key = "bugie:session-state:" + userId;
        if (!bypassCache && _cache.TryGetValue(key, out SessionLookup? cached) && cached is not null)
            return cached with { FromCache = true };

        var token = _cfg["InternalToken"];
        if (string.IsNullOrEmpty(token))
        {
            _log.LogError("Sesion: InternalToken no configurado.");
            return SessionLookup.Unavailable();
        }

        var baseUrl = (_cfg["Services:AuthApi"] ?? "http://127.0.0.1:5001").TrimEnd('/') + "/";
        try
        {
            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(3);
            using var req = new HttpRequestMessage(HttpMethod.Get,
                new Uri(new Uri(baseUrl), $"api/internal/users/{userId}/session-state"));
            req.Headers.Add("X-Internal-Token", token);

            using var res = await client.SendAsync(req, ct);
            SessionLookup lookup;
            if (res.StatusCode == HttpStatusCode.NotFound)
            {
                lookup = new SessionLookup(SessionLookupStatus.NotFound, null, DateTime.UtcNow, false);
            }
            else if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadFromJsonAsync<SessionStateInfo>(cancellationToken: ct);
                if (body is null) return SessionLookup.Unavailable();
                lookup = new SessionLookup(SessionLookupStatus.Found, body, DateTime.UtcNow, false);
            }
            else
            {
                _log.LogWarning("Sesion: Auth respondio {Status}.", (int)res.StatusCode);
                return SessionLookup.Unavailable();
            }

            var seconds = int.TryParse(_cfg["SessionState:CacheSeconds"], out var s) ? s : 30;
            _cache.Set(key, lookup, TimeSpan.FromSeconds(Math.Clamp(seconds, 1, 300)));
            return lookup;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            _log.LogWarning("Sesion: Auth no respondio ({Error}).", ex.Message);
            return SessionLookup.Unavailable();
        }
    }
}
