using System.Net.Http.Json;
using Bugie.Drivers.Domain.External;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Bugie.Drivers.Infrastructure.External;

/// <summary>
/// Envía avisos al panel admin a través de Trips.Api
/// (POST api/internal/admin-events con X-Internal-Token).
///
/// Fire-and-forget seguro: el envío corre en segundo plano solo con el
/// HttpClient (de IHttpClientFactory, ver Program.cs) y los datos ya leídos;
/// no usa nada de la petición original (ni la conexión a BD). Si Trips no
/// responde, solo se pierde el aviso. URL: Services:TripsApi.
/// </summary>
public class AdminEventsPublisher : IAdminEventsPublisher
{
    private readonly HttpClient _http;
    private readonly string _token;
    private readonly ILogger<AdminEventsPublisher> _log;

    public AdminEventsPublisher(HttpClient http, IConfiguration cfg, ILogger<AdminEventsPublisher> log)
    {
        _http = http;
        _token = cfg["InternalToken"] ?? string.Empty;
        _log = log;
    }

    public void Publish(string type, string title, string message, string link, string permission)
    {
        var body = new { type, title, message, link, permission };
        _ = Task.Run(async () =>
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, "api/internal/admin-events");
                req.Headers.Add("X-Internal-Token", _token);
                req.Content = JsonContent.Create(body);
                using var res = await _http.SendAsync(req);
                if(!res.IsSuccessStatusCode)
                    _log.LogWarning("Trips rechazó el aviso admin '{Type}': {Status}", type, res.StatusCode);
            }
            catch(Exception ex)
            {
                _log.LogInformation("No se pudo enviar el aviso admin '{Type}' ({Error}).", type, ex.Message);
            }
        });
    }
}
