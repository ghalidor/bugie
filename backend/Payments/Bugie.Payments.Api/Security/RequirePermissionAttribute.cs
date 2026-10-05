// =============================================================================
// MISMO ARCHIVO en las 6 APIs (Auth, Drivers, Trips, Payments, Landing, Rewards):
//   Bugie.<X>.Api/Security/RequirePermissionAttribute.cs
// Si lo cambias, copialo identico a las otras 5.
// =============================================================================
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

namespace Bugie.Security;

/// <summary>
/// Permisos granulares del panel admin, validados en el BACKEND.
///
/// Uso: [RequirePermission(Perm.ViewPayments)] en el controlador o en la accion.
///   - Varios codigos en el mismo atributo = basta con CUALQUIERA de ellos.
///   - Varios atributos (controlador + accion) = hay que cumplir TODOS.
///   - super_admin pasa siempre.
///   - Sin permiso: 403 { error: "No tienes permiso para esta seccion." }.
///   - Si no se pueden leer los permisos (Auth caido): 503 (nunca se concede por defecto).
///   - Llamadas entre modulos con X-Internal-Token valido pasan (el modulo que
///     llama ya autorizo al usuario).
///   - Usuarios que no son admin: 403, salvo SkipForNonAdmins = true (endpoints
///     mixtos "participante o admin": el filtro solo se aplica a los admins y el
///     resto lo decide la propia accion).
///
/// De donde salen los permisos:
///   - Auth: lectura directa con IPermissionService (LocalAdminPermissionSource).
///   - Resto: GET {Services:AuthApi}/api/internal/admins/{userId}/permissions
///     con X-Internal-Token, cacheado en memoria por usuario
///     (AdminPermissions:CacheSeconds, por defecto 45 s). Un cambio de rol tarda
///     como maximo ese tiempo en aplicarse en esas APIs.
///
/// Mapeo permiso -> endpoints: backend/scripts/test-data/README.md
/// ("Permisos del panel admin en el backend").
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true, Inherited = true)]
public sealed class RequirePermissionAttribute : Attribute, IAsyncAuthorizationFilter
{
    public RequirePermissionAttribute(params string[] permissions) =>
        Permissions = permissions ?? Array.Empty<string>();

    /// <summary>Codigos aceptados (basta con uno).</summary>
    public string[] Permissions { get; }

    /// <summary>
    /// true = el filtro solo se aplica a usuarios con rol admin. Para endpoints
    /// que tambien usan pasajeros/conductores y validan la participacion dentro.
    /// </summary>
    public bool SkipForNonAdmins { get; set; }

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var http = context.HttpContext;
        if (AdminPermissions.IsInternalCall(http)) return;

        var user = http.User;
        if (user.Identity?.IsAuthenticated != true)
        {
            if (!SkipForNonAdmins) context.Result = new UnauthorizedResult();
            return;
        }
        if (!user.IsInRole("admin"))
        {
            if (!SkipForNonAdmins) context.Result = AdminPermissions.Forbidden();
            return;
        }

        var denied = await http.CheckAdminPermissionAsync(Permissions);
        if (denied is not null) context.Result = denied;
    }
}

/// <summary>Codigos del catalogo (iguales a Bugie.Auth.Domain.Constants.Permissions).</summary>
public static class Perm
{
    public const string ViewDashboard = "view:dashboard";
    public const string ViewUsers = "view:users";
    public const string ViewDrivers = "view:drivers";
    public const string ViewPassengers = "view:passengers";
    public const string ViewTrips = "view:trips";
    public const string ViewPayments = "view:payments";
    public const string ViewLiveMap = "view:live_map";
    public const string ViewSosCenter = "view:sos_center";
    public const string ViewLanding = "view:landing";
    public const string ViewCommunity = "view:community";
    public const string ViewLegalDocs = "view:legal_docs";
    public const string ViewFaq = "view:faq";
    public const string ViewReports = "view:reports";
    public const string ViewSecurity = "view:security";
    public const string ViewVerification = "view:verification";
    public const string ViewDriverPayouts = "view:driver_payouts";
    public const string ViewCommissions = "view:commissions";
    public const string ViewRewards = "view:rewards";
    public const string ViewMessages = "view:messages";
    public const string ViewSettings = "view:settings";
    public const string ViewNotificationsConfig = "view:notifications_config";
    public const string ViewComplaints = "view:complaints";
    public const string ViewCompany = "view:company";

    public const string ActionApproveDriver = "action:approve_driver";
    public const string ActionApprovePassenger = "action:approve_passenger";
    public const string ActionSaveLanding = "action:save_landing";
    public const string ActionCreateCommunity = "action:create_community";
    public const string ActionEditCommunity = "action:edit_community";
    public const string ActionToggleCommunity = "action:toggle_community";
    public const string ActionSaveLegalDocs = "action:save_legal_docs";
}

/// <summary>Permisos efectivos de un admin.</summary>
public sealed class AdminPermissionSet
{
    public static readonly AdminPermissionSet None = new(false, Array.Empty<string>());

    private readonly HashSet<string> _set;

    public AdminPermissionSet(bool isSuperAdmin, IEnumerable<string>? permissions)
    {
        IsSuperAdmin = isSuperAdmin;
        _set = new HashSet<string>(permissions ?? Array.Empty<string>(), StringComparer.Ordinal);
    }

    public bool IsSuperAdmin { get; }
    public IReadOnlyCollection<string> Permissions => _set;

    public bool Has(string permission) => IsSuperAdmin || _set.Contains(permission);
    public bool HasAny(params string[] permissions) => IsSuperAdmin || permissions.Any(_set.Contains);
}

/// <summary>Fuente de permisos. Lanza AdminPermissionsUnavailableException si no puede responder.</summary>
public interface IAdminPermissionSource
{
    Task<AdminPermissionSet> GetAsync(Guid userId, CancellationToken ct);
}

public sealed class AdminPermissionsUnavailableException : Exception
{
    public AdminPermissionsUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>
/// Pide los permisos a Auth (endpoint interno) y los guarda en memoria unos
/// segundos por usuario. Solo se cachean respuestas correctas.
/// </summary>
public sealed class HttpAdminPermissionSource : IAdminPermissionSource
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly IMemoryCache _cache;
    private readonly ILogger<HttpAdminPermissionSource> _log;

    public HttpAdminPermissionSource(IHttpClientFactory http, IConfiguration cfg, IMemoryCache cache,
                                     ILogger<HttpAdminPermissionSource> log)
    {
        _http = http;
        _cfg = cfg;
        _cache = cache;
        _log = log;
    }

    private sealed record PermissionsResponse(bool IsSuperAdmin, List<string>? Permissions);

    public async Task<AdminPermissionSet> GetAsync(Guid userId, CancellationToken ct)
    {
        var key = "bugie:admin-permissions:" + userId;
        if (_cache.TryGetValue(key, out AdminPermissionSet? cached) && cached is not null) return cached;

        var token = _cfg["InternalToken"];
        if (string.IsNullOrEmpty(token))
        {
            _log.LogError("Permisos admin: InternalToken no configurado.");
            throw new AdminPermissionsUnavailableException("InternalToken no configurado.");
        }

        var baseUrl = (_cfg["Services:AuthApi"] ?? "http://localhost:5001").TrimEnd('/') + "/";
        try
        {
            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(5);
            using var req = new HttpRequestMessage(HttpMethod.Get,
                new Uri(new Uri(baseUrl), $"api/internal/admins/{userId}/permissions"));
            req.Headers.Add("X-Internal-Token", token);

            using var res = await client.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                _log.LogWarning("Permisos admin: Auth respondio {Status}.", (int)res.StatusCode);
                throw new AdminPermissionsUnavailableException($"Auth respondio {(int)res.StatusCode}.");
            }

            var body = await res.Content.ReadFromJsonAsync<PermissionsResponse>(cancellationToken: ct)
                       ?? throw new AdminPermissionsUnavailableException("Respuesta vacia de Auth.");
            var set = new AdminPermissionSet(body.IsSuperAdmin, body.Permissions);

            var seconds = int.TryParse(_cfg["AdminPermissions:CacheSeconds"], out var s) ? s : 45;
            _cache.Set(key, set, TimeSpan.FromSeconds(Math.Clamp(seconds, 5, 300)));
            return set;
        }
        catch (AdminPermissionsUnavailableException) { throw; }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            _log.LogWarning("Permisos admin: Auth no respondio ({Error}).", ex.Message);
            throw new AdminPermissionsUnavailableException("Auth no respondio.", ex);
        }
    }
}

public static class AdminPermissions
{
    public const string ForbiddenMessage = "No tienes permiso para esta sección.";
    public const string UnavailableMessage =
        "No se pudieron verificar tus permisos. Intenta de nuevo en unos segundos.";

    private const string ItemsKey = "bugie:admin-permissions";

    public static IActionResult Forbidden(string? message = null) =>
        new ObjectResult(new { error = message ?? ForbiddenMessage }) { StatusCode = StatusCodes.Status403Forbidden };

    public static IActionResult Unavailable() =>
        new ObjectResult(new { error = UnavailableMessage }) { StatusCode = StatusCodes.Status503ServiceUnavailable };

    /// <summary>Header X-Internal-Token igual a InternalToken (comparacion en tiempo constante).</summary>
    public static bool IsInternalCall(HttpContext http)
    {
        var expected = http.RequestServices.GetService<IConfiguration>()?["InternalToken"];
        var received = http.Request.Headers["X-Internal-Token"].ToString();
        return !string.IsNullOrEmpty(received) && !string.IsNullOrEmpty(expected) &&
               CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(received), Encoding.UTF8.GetBytes(expected));
    }

    /// <summary>
    /// Permisos del usuario actual (una sola consulta por request). Si no es
    /// admin devuelve None. Lanza AdminPermissionsUnavailableException si Auth falla.
    /// </summary>
    public static async Task<AdminPermissionSet> GetAdminPermissionsAsync(this HttpContext http)
    {
        if (http.Items.TryGetValue(ItemsKey, out var v) && v is AdminPermissionSet done) return done;

        var user = http.User;
        if (user.Identity?.IsAuthenticated != true || !user.IsInRole("admin")
            || !Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return AdminPermissionSet.None;

        var source = http.RequestServices.GetRequiredService<IAdminPermissionSource>();
        var set = await source.GetAsync(userId, http.RequestAborted);
        http.Items[ItemsKey] = set;
        return set;
    }

    /// <summary>null = permitido; si no, el 403 o el 503 que hay que devolver.</summary>
    public static async Task<IActionResult?> CheckAdminPermissionAsync(this HttpContext http, params string[] permissions)
    {
        try
        {
            var set = await http.GetAdminPermissionsAsync();
            return set.HasAny(permissions) ? null : Forbidden();
        }
        catch (AdminPermissionsUnavailableException)
        {
            return Unavailable();
        }
    }

    /// <summary>Registra la fuente HTTP (Auth interno + cache). Auth registra la suya propia.</summary>
    public static IServiceCollection AddBugieAdminPermissionsFromAuth(this IServiceCollection services)
    {
        services.AddMemoryCache();
        services.AddHttpClient();
        services.TryAddSingleton<IAdminPermissionSource, HttpAdminPermissionSource>();
        return services;
    }
}
