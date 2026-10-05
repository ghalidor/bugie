using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bugie.Security;

namespace Bugie.Trips.Api.Controllers;

/// <summary>
/// Resumen para los recordatorios periódicos del panel admin (Centro de avisos).
/// Solo conteos, sin nombres.
///
/// GET /api/trips/admin/notifications/summary
///
/// Junta datos de otros servicios reenviando el JWT del admin:
///   - Drivers: conductores con documentos por vencer (según doc_expiry_alert_days)
///              y conductores con documentos por revisar.
///   - Landing: mensajes de contacto sin respuesta y reclamaciones pendientes.
///   - Auth:    pasajeros con DNI subido esperando aprobación.
/// Si un servicio no responde, ese dato sale null (el panel lo omite).
/// </summary>
[ApiController]
[Route("api/trips/admin/notifications")]
[Authorize(Roles = "admin")]
public class AdminNotificationsController : ControllerBase
{
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly ILogger<AdminNotificationsController> _log;

    public AdminNotificationsController(IHttpClientFactory http, IConfiguration cfg,
                                        ILogger<AdminNotificationsController> log)
    {
        _http = http;
        _cfg = cfg;
        _log = log;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct)
    {
        // Cada conteo solo si el admin tiene el permiso de su seccion; si no, null
        // (y ni se consulta el servicio). Mismos permisos que el Centro de avisos:
        //   documentsExpiring / openReviewRequests -> view:drivers
        //   driversToReview -> view:verification, unattendedMessages -> view:messages
        //   complaints -> view:complaints, passengersToApprove -> view:passengers
        AdminPermissionSet perms;
        try { perms = await HttpContext.GetAdminPermissionsAsync(); }
        catch (AdminPermissionsUnavailableException) { return AdminPermissions.Unavailable(); }

        var canDrivers = perms.Has(Perm.ViewDrivers);
        var canReview = perms.Has(Perm.ViewVerification);
        var canMessages = perms.Has(Perm.ViewMessages);
        var canComplaints = perms.Has(Perm.ViewComplaints);
        var canPassengers = perms.Has(Perm.ViewPassengers);
        var skip = Task.FromResult<JsonElement?>(null);

        var drivers = !(canDrivers || canReview) ? skip : GetJsonAsync(_cfg["Services:DriversApi"] ?? "http://localhost:5003",
                                   "api/drivers/admin/notifications/summary", ct);
        var landing = !canMessages ? skip : GetJsonAsync(_cfg["Services:LandingApi"] ?? "http://localhost:5005",
                                   "api/landing/admin/notifications/summary", ct);
        var complaints = !canComplaints ? skip : GetJsonAsync(_cfg["Services:LandingApi"] ?? "http://localhost:5005",
                                      "api/landing/admin/complaints/summary", ct);
        var passengers = !canPassengers ? skip : GetJsonAsync(_cfg["Services:AuthApi"] ?? "http://localhost:5001",
                                      "api/auth/admin/passengers/pending-review/count", ct);

        await Task.WhenAll(drivers, landing, complaints, passengers);

        var d = drivers.Result;
        var dDocs = canDrivers ? d : null;
        var dReview = canReview ? d : null;
        var l = landing.Result;
        var c = complaints.Result;
        var p = passengers.Result;

        return Ok(new
        {
            documentsExpiring = dDocs is null ? null : new
            {
                count = ReadInt(dDocs.Value, "expiringDrivers"),
                thresholdDays = ReadIntArray(dDocs.Value, "thresholdDays"),
            },
            driversToReview = dReview is null ? (int?)null : ReadInt(dReview.Value, "driversToReview"),
            openReviewRequests = dDocs is null ? (int?)null : ReadInt(dDocs.Value, "openReviewRequests"),
            unattendedMessages = l is null ? (int?)null : ReadInt(l.Value, "unattendedMessages"),
            complaints = c is null ? null : new
            {
                pending = ReadInt(c.Value, "pending"),
                overdue = ReadInt(c.Value, "overdue"),
            },
            passengersToApprove = p is null ? (int?)null : ReadInt(p.Value, "count"),
        });
    }

    /// <summary>GET con el mismo Authorization del admin. null si falla.</summary>
    private async Task<JsonElement?> GetJsonAsync(string baseUrl, string path, CancellationToken ct)
    {
        try
        {
            var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10); // la primera llamada (en frío) puede tardar unos segundos
            using var req = new HttpRequestMessage(HttpMethod.Get, new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), path));
            var auth = Request.Headers.Authorization.ToString();
            if(AuthenticationHeaderValue.TryParse(auth, out var header))
                req.Headers.Authorization = header;

            using var res = await client.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode)
            {
                _log.LogInformation("Resumen de avisos: {Path} respondió {Status}.", path, (int)res.StatusCode);
                return null;
            }
            await using var stream = await res.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            return doc.RootElement.Clone();
        }
        catch(Exception ex)
        {
            _log.LogInformation("Resumen de avisos: {Path} no respondió ({Error}).", path, ex.Message);
            return null;
        }
    }

    private static int ReadInt(JsonElement el, string name) =>
        TryGet(el, name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? n : 0;

    private static int[] ReadIntArray(JsonElement el, string name) =>
        TryGet(el, name, out var v) && v.ValueKind == JsonValueKind.Array
            ? v.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Number).Select(x => x.GetInt32()).ToArray()
            : Array.Empty<int>();

    /// <summary>Busca la propiedad sin importar mayúsculas (camelCase o PascalCase).</summary>
    private static bool TryGet(JsonElement el, string name, out JsonElement value)
    {
        value = default;
        if(el.ValueKind != JsonValueKind.Object) return false;
        foreach(var prop in el.EnumerateObject())
        {
            if(string.Equals(prop.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = prop.Value;
                return true;
            }
        }
        return false;
    }
}
