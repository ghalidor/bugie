using Bugie.Auth.Application.Email;
using Bugie.Auth.Domain.External;
using Bugie.Auth.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bugie.Auth.Api.Controllers;

/// <summary>
/// Correo de aviso a un usuario, para que otros microservicios (Trips) puedan
/// avisar por correo sin tener SMTP ni la tabla de usuarios.
///
/// Seguridad: igual que InternalFcmController, requiere el header
/// X-Internal-Token (appsettings: InternalToken). No usa JWT.
///
/// Quién lo consume:
///   - Trips.Api → "recogimos tu paquete" y "tu envío fue entregado".
/// </summary>
[ApiController]
[Route("api/internal/notify")]
[AllowAnonymous] // El token interno protege este endpoint, no el JWT.
public class InternalNotifyController : ControllerBase
{
    private readonly IUserRepository _users;
    private readonly IEmailService _email;
    private readonly ILandingSettingsClient _settings;
    private readonly IConfiguration _cfg;
    private readonly ILogger<InternalNotifyController> _log;

    public InternalNotifyController(
        IUserRepository users,
        IEmailService email,
        ILandingSettingsClient settings,
        IConfiguration cfg,
        ILogger<InternalNotifyController> log)
    {
        _users = users;
        _email = email;
        _settings = settings;
        _cfg = cfg;
        _log = log;
    }

    public record EmailRequest(Guid UserId, string Subject, string Title, string Message);

    /// <summary>
    /// POST /api/internal/notify/email
    /// Body: { userId, subject, title, message } (texto plano; se escapa en el HTML).
    /// </summary>
    [HttpPost("email")]
    public async Task<IActionResult> Email([FromBody] EmailRequest req, CancellationToken ct)
    {
        var expected = _cfg["InternalToken"];
        if(!Bugie.Auth.Api.Security.InternalTokenCheck.Matches(Request.Headers["X-Internal-Token"].ToString(), expected))
            return Unauthorized(new { error = "Token interno inválido." });

        if(string.IsNullOrWhiteSpace(req.Subject) || string.IsNullOrWhiteSpace(req.Message))
            return BadRequest(new { error = "Faltan el asunto o el mensaje." });

        var user = await _users.GetByIdAsync(req.UserId, ct);
        if(user is null) return NotFound(new { error = "Usuario no encontrado." });

        var city = await _settings.GetDefaultCityAsync(ct);
        await _email.SendAsync(
            toEmail: user.Email,
            toName: user.FullName,
            subject: req.Subject,
            htmlBody: EmailTemplates.Notification(user.FullName, req.Title ?? req.Subject, req.Message, city),
            ct);

        _log.LogInformation("Correo de aviso enviado a {UserId}: {Subject}", req.UserId, req.Subject);
        return Ok(new { sent = true });
    }

    public record EmailToRequest(
        string ToEmail, string? ToName, string Subject, string? Title, string Message,
        string? LinkUrl, string? LinkText);

    /// <summary>
    /// POST /api/internal/notify/email-to
    /// Correo a una dirección que NO es usuario de Bugie (ej. el contacto de
    /// emergencia cuando su familiar activa un SOS).
    /// Body: { toEmail, toName, subject, title, message, linkUrl?, linkText? }
    /// </summary>
    [HttpPost("email-to")]
    public async Task<IActionResult> EmailTo([FromBody] EmailToRequest req, CancellationToken ct)
    {
        var expected = _cfg["InternalToken"];
        if(!Bugie.Auth.Api.Security.InternalTokenCheck.Matches(Request.Headers["X-Internal-Token"].ToString(), expected))
            return Unauthorized(new { error = "Token interno inválido." });

        if(string.IsNullOrWhiteSpace(req.ToEmail) || !System.Net.Mail.MailAddress.TryCreate(req.ToEmail, out _))
            return BadRequest(new { error = "Correo de destino inválido." });
        if(string.IsNullOrWhiteSpace(req.Subject) || string.IsNullOrWhiteSpace(req.Message))
            return BadRequest(new { error = "Faltan el asunto o el mensaje." });

        // Solo se aceptan enlaces http(s) para el botón.
        var link = req.LinkUrl;
        if(!string.IsNullOrWhiteSpace(link) &&
           !(link.StartsWith("https://") || link.StartsWith("http://")))
            link = null;

        var name = string.IsNullOrWhiteSpace(req.ToName) ? req.ToEmail : req.ToName;
        var city = await _settings.GetDefaultCityAsync(ct);
        await _email.SendAsync(
            toEmail: req.ToEmail,
            toName: name,
            subject: req.Subject,
            htmlBody: EmailTemplates.NotificationWithLink(
                name, req.Title ?? req.Subject, req.Message, link, req.LinkText, city),
            ct);

        _log.LogInformation("Correo de aviso enviado a {Email}: {Subject}", req.ToEmail, req.Subject);
        return Ok(new { sent = true });
    }
}
