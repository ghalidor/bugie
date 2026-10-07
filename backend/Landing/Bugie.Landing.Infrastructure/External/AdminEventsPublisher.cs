using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.External;

/// <summary>
/// Envia un aviso al centro de avisos del admin:
///   POST {Services:TripsApi}/api/internal/admin-events  (header X-Internal-Token)
/// Dispara y olvida: corre en segundo plano, sin usar la conexion a la base
/// de la peticion, y si Trips no responde solo se registra en el log.
/// </summary>
public class AdminEventsPublisher : IAdminEventsPublisher
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };

    private readonly string _baseUrl;
    private readonly string _token;
    private readonly ILogger<AdminEventsPublisher> _log;

    public AdminEventsPublisher(IConfiguration cfg, ILogger<AdminEventsPublisher> log)
    {
        _baseUrl = (cfg["Services:TripsApi"] ?? "http://127.0.0.1:5002").TrimEnd('/');
        _token = cfg["InternalToken"] ?? "";
        _log = log;
    }

    public void Publish(string type, string title, string message, string link, string permission)
    {
        var payload = new { type, title, message, link, permission };
        _ = Task.Run(async () =>
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/api/internal/admin-events")
                {
                    Content = JsonContent.Create(payload),
                };
                req.Headers.Add("X-Internal-Token", _token);
                using var res = await Http.SendAsync(req);
                if(!res.IsSuccessStatusCode)
                    _log.LogWarning("admin-events respondio {Status} para {Message}", (int)res.StatusCode, message);
            }
            catch(Exception ex)
            {
                _log.LogWarning(ex, "No se pudo enviar el aviso admin-events ({Message})", message);
            }
        });
    }
}
