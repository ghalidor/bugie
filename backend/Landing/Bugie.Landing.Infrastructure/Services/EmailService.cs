using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Infrastructure.Services;
public class EmailService : IEmailService
{
    private readonly IConfiguration _cfg;
    private readonly ISettingsRepository _settings;

    public EmailService(IConfiguration cfg, ISettingsRepository settings)
    {
        _cfg = cfg;
        _settings = settings;
    }

    /// <summary>
    /// Lee la ciudad principal desde landing.SystemSettings (key 'default_city').
    /// Si no existe o está vacía, usa el texto neutro "tu ciudad".
    /// Capitalizamos la primera letra para que quede prolijo en el email.
    /// </summary>
    private async Task<string> ResolveCityAsync(CancellationToken ct)
    {
        var setting = await _settings.GetByKeyAsync("default_city", ct);
        var raw = setting?.Value?.Trim();
        if(string.IsNullOrWhiteSpace(raw)) return "tu ciudad";
        // tacna -> Tacna, TRUJILLO -> Trujillo
        return char.ToUpper(raw[0]) + raw[1..].ToLower();
    }

    public async Task SendContactEmailAsync(
        string fromName, string fromEmail,
        string subject, string message,
        CancellationToken ct = default)
    {
        var host = _cfg["Smtp:Host"] ?? "smtp.gmail.com";
        var port = int.Parse(_cfg["Smtp:Port"] ?? "587");
        var user = _cfg["Smtp:Username"] ?? "";
        var pass = _cfg["Smtp:Password"] ?? "";
        var fromAddr = _cfg["Smtp:FromEmail"] ?? user;
        var fromNm = _cfg["Smtp:FromName"] ?? "Bugie";
        // Destino del aviso al admin: usamos la misma casilla del FROM
        // (configurada en Smtp:Username). Si quieres separar el destino,
        // agrega "Smtp:ContactTo" en appsettings y cámbialo aquí.
        var contactTo = _cfg["Smtp:ContactTo"] ?? user;

        using var client = new SmtpClient(host, port)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(user, pass),
            DeliveryMethod = SmtpDeliveryMethod.Network,
            UseDefaultCredentials = false,
        };

        using var mail = new MailMessage
        {
            From = new MailAddress(fromAddr, fromNm),
            Subject = $"[Bugie Contacto] {subject} — {fromName}",
            IsBodyHtml = true,
            Body = BuildHtml(fromName, fromEmail, subject, message,
                              await ResolveCityAsync(ct)),
        };

        mail.To.Add(contactTo);
        mail.ReplyToList.Add(new MailAddress(fromEmail, fromName));

        await client.SendMailAsync(mail, ct);
    }

    /// <summary>
    /// Envío genérico — lo usa ReplyToContactHandler para mandar la respuesta
    /// del admin al email del usuario que escribió originalmente.
    /// Reusa la misma sección "Smtp" del appsettings. Si el SMTP no está
    /// configurado o falla, relanza la excepción para que el caller pueda
    /// persistir el error.
    /// </summary>
    public async Task SendAsync(
        string toEmail, string toName,
        string subject, string htmlBody,
        CancellationToken ct = default)
    {
        var host = _cfg["Smtp:Host"] ?? "smtp.gmail.com";
        var port = int.Parse(_cfg["Smtp:Port"] ?? "587");
        var user = _cfg["Smtp:Username"] ?? "";
        var pass = _cfg["Smtp:Password"] ?? "";
        var fromAddr = _cfg["Smtp:FromEmail"] ?? user;
        var fromNm = _cfg["Smtp:FromName"] ?? "Bugie";

        if(string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass))
            throw new InvalidOperationException("SMTP no configurado (Smtp:Username / Password).");

        using var client = new SmtpClient(host, port)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(user, pass),
            DeliveryMethod = SmtpDeliveryMethod.Network,
            UseDefaultCredentials = false,
        };

        using var mail = new MailMessage
        {
            From = new MailAddress(fromAddr, fromNm),
            Subject = subject,
            IsBodyHtml = true,
            Body = htmlBody,
        };
        mail.To.Add(new MailAddress(toEmail, toName));

        await client.SendMailAsync(mail, ct);
    }

    private static string BuildHtml(
        string name, string email, string subject, string message, string city)
    {
        var safeName = WebUtility.HtmlEncode(name);
        var safeEmail = WebUtility.HtmlEncode(email);
        var safeSubject = WebUtility.HtmlEncode(subject);
        var safeCity = WebUtility.HtmlEncode(city);
        var safeMessage = WebUtility.HtmlEncode(message)
                            .Replace("&#10;", "<br>")
                            .Replace("\n", "<br>");

        return string.Concat(
            "<!DOCTYPE html><html lang='es'><head><meta charset='UTF-8'>",
            "<style>",
            "body{margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0}",
            ".wrap{max-width:600px;margin:32px auto;background:#1a1d27;border-radius:16px;overflow:hidden;border:1px solid rgba(91,91,214,.25)}",
            ".header{background:linear-gradient(135deg,#5B5BD6 0%,#C060C0 100%);padding:32px;text-align:center}",
            ".logo{font-size:28px;font-weight:800;color:#fff;letter-spacing:-.04em;margin-bottom:4px}",
            ".sub{font-size:13px;color:rgba(255,255,255,.8)}",
            ".badge{display:inline-block;background:rgba(255,255,255,.2);color:#fff;border-radius:999px;padding:4px 14px;font-size:12px;margin-top:12px}",
            ".body{padding:32px}",
            ".section-title{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#8b8fa8;font-weight:700;margin-bottom:8px}",
            ".field{background:#0f1117;border:1px solid rgba(91,91,214,.2);border-radius:10px;padding:14px 16px;margin-bottom:16px}",
            ".field-label{font-size:11px;color:#8b8fa8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}",
            ".field-value{font-size:15px;color:#e2e8f0;font-weight:500}",
            ".msg-box{background:#0f1117;border:1px solid rgba(91,91,214,.2);border-radius:10px;padding:16px;margin-bottom:24px;line-height:1.7;color:#c8cce0}",
            ".footer{background:#0f1117;border-top:1px solid rgba(91,91,214,.15);padding:20px 32px;text-align:center;font-size:12px;color:#8b8fa8}",
            ".divider{height:1px;background:rgba(91,91,214,.15);margin:24px 0}",
            "</style></head><body>",
            "<div class='wrap'>",
            "  <div class='header'>",
            "    <div class='logo'>Bugie</div>",
            $"   <div class='sub'>Tu App de Transporte Seguro - {safeCity}, Peru</div>",
            "    <div class='badge'>Nuevo mensaje de contacto</div>",
            "  </div>",
            "  <div class='body'>",
            "    <div class='section-title'>Remitente</div>",
            "    <div class='field'><div class='field-label'>Nombre</div>",
            $"   <div class='field-value'>{safeName}</div></div>",
            "    <div class='field'><div class='field-label'>Correo</div>",
            $"   <div class='field-value'><a href='mailto:{safeEmail}' style='color:#a5b4fc;text-decoration:none'>{safeEmail}</a></div></div>",
            "    <div class='field'><div class='field-label'>Motivo</div>",
            $"   <div class='field-value'>{safeSubject}</div></div>",
            "    <div class='divider'></div>",
            "    <div class='section-title'>Mensaje</div>",
            $"   <div class='msg-box'>{safeMessage}</div>",
            "  </div>",
            "  <div class='footer'>",
            $"   <p>Enviado desde el formulario de contacto de <strong>bugie.pe</strong></p>",
            $"   <p>Responde a <a href='mailto:{safeEmail}' style='color:#8b8fa8'>{safeEmail}</a></p>",
            $"   <p style='margin-top:12px;font-size:11px'>2026 Bugie - InteliaDevs S.A.C. - {safeCity}, Peru</p>",
            "  </div>",
            "</div>",
            "</body></html>"
        );
    }
}