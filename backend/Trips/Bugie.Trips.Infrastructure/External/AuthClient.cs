using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Infrastructure.External;

public class AuthClient : IAuthClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpContext;
    private readonly IConfiguration _cfg;

    // Auth devuelve las fechas en hora de Peru sin zona: se leen como UTC (ver BugieTime).
    private static readonly System.Text.Json.JsonSerializerOptions Json =
        new(System.Text.Json.JsonSerializerDefaults.Web) { Converters = { new Bugie.Trips.Infrastructure.Time.PeruDateTimeJsonConverter() } };

    public AuthClient(HttpClient http, IHttpContextAccessor httpContext, IConfiguration cfg)
    {
        _http = http;
        _httpContext = httpContext;
        _cfg = cfg;
    }

    public async Task<Dictionary<Guid, UserInfoDto>> GetUsersByIdsAsync(
        IEnumerable<Guid> ids, CancellationToken ct = default)
    {
        var idList = ids?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new Dictionary<Guid, UserInfoDto>();

        var query = string.Join("&", idList.Select(id => $"ids={id}"));
        // Endpoint interno de Auth (X-Internal-Token): el publico /api/auth/users/bulk
        // ya solo devuelve datos minimos a quien no es admin.
        using var req = new HttpRequestMessage(HttpMethod.Get, $"api/internal/users/bulk?{query}");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");

        try
        {
            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode) return new Dictionary<Guid, UserInfoDto>();
            var users = await res.Content.ReadFromJsonAsync<List<UserInfoDto>>(Json, ct);
            return users?.ToDictionary(u => u.Id) ?? new Dictionary<Guid, UserInfoDto>();
        }
        catch
        {
            return new Dictionary<Guid, UserInfoDto>();
        }
    }

    public async Task<List<FcmTokenInfo>> GetFcmTokensAsync(
        IEnumerable<Guid> userIds, CancellationToken ct = default)
    {
        var idList = userIds?.Distinct().ToList() ?? new List<Guid>();
        if(idList.Count == 0) return new List<FcmTokenInfo>();

        var query = string.Join("&", idList.Select(id => $"ids={id}"));
        using var req = new HttpRequestMessage(
            HttpMethod.Get, $"api/internal/fcm-tokens/by-users?{query}");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");

        // Si Auth falla se lanza excepcion (FcmSender la registra y no envia):
        // asi una falla no se confunde con "el usuario no tiene tokens" y no se
        // guarda en el cache de tokens.
        using var res = await _http.SendAsync(req, ct);
        if(!res.IsSuccessStatusCode)
            throw new HttpRequestException($"Auth respondio {(int)res.StatusCode} al pedir tokens FCM.");
        var tokens = await res.Content.ReadFromJsonAsync<List<FcmTokenInfo>>(cancellationToken: ct);
        return tokens ?? new List<FcmTokenInfo>();
    }

    public async Task DeleteFcmTokenAsync(string token, CancellationToken ct = default)
    {
        if(string.IsNullOrEmpty(token)) return;
        using var req = new HttpRequestMessage(
            HttpMethod.Delete, $"api/internal/fcm-tokens/{Uri.EscapeDataString(token)}");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");

        try
        {
            using var res = await _http.SendAsync(req, ct);
            // No nos importa el resultado: si falla, lo reintentaremos en el
            // próximo push fallido.
        }
        catch { /* Idempotente, ignoramos errores. */ }
    }

    public async Task SendEmailToUserAsync(
        Guid userId, string subject, string title, string message, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "api/internal/notify/email");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
        req.Content = JsonContent.Create(new { userId, subject, title, message });
        try
        {
            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode)
                Console.WriteLine($"[Email] Auth respondio {(int)res.StatusCode} al enviar correo a {userId}.");
        }
        catch(Exception ex)
        {
            // El correo es un aviso extra: si falla, el flujo sigue.
            Console.WriteLine($"[Email] No se pudo enviar correo a {userId}: {ex.Message}");
        }
    }

    public async Task<EmergencyContactInfo?> GetEmergencyContactAsync(Guid userId, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"api/internal/emergency-contact/{userId}");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
        try
        {
            using var res = await _http.SendAsync(req, ct);
            // 404 = el usuario no registró contacto.
            if(!res.IsSuccessStatusCode) return null;
            return await res.Content.ReadFromJsonAsync<EmergencyContactInfo>(cancellationToken: ct);
        }
        catch
        {
            return null;
        }
    }

    public async Task SendEmailToAddressAsync(
        string toEmail, string? toName, string subject, string title, string message,
        string? linkUrl = null, string? linkText = null, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "api/internal/notify/email-to");
        req.Headers.Add("X-Internal-Token", _cfg["InternalToken"] ?? "");
        req.Content = JsonContent.Create(new { toEmail, toName, subject, title, message, linkUrl, linkText });
        try
        {
            using var res = await _http.SendAsync(req, ct);
            if(!res.IsSuccessStatusCode)
                Console.WriteLine($"[Email] Auth respondio {(int)res.StatusCode} al enviar correo a {toEmail}.");
        }
        catch(Exception ex)
        {
            // El correo es un aviso extra: si falla, el flujo sigue.
            Console.WriteLine($"[Email] No se pudo enviar correo a {toEmail}: {ex.Message}");
        }
    }
}
