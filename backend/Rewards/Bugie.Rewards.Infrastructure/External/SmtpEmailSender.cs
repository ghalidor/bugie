using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Bugie.Rewards.Domain.External;

namespace Bugie.Rewards.Infrastructure.External;

/// <summary>Mismos campos que el SmtpOptions de Auth, para reusar la config.</summary>
public class SmtpOptions
{
    public string Host      { get; set; } = "smtp.gmail.com";
    public int    Port      { get; set; } = 587;
    public bool   EnableSsl { get; set; } = true;
    public string Username  { get; set; } = string.Empty;
    public string Password  { get; set; } = string.Empty;
    public string FromEmail { get; set; } = string.Empty;
    public string FromName  { get; set; } = "Bugie";
}

/// <summary>
/// Envía correo por SMTP, igual que Auth.
///
/// Si no está configurado o si falla, NO lanza excepción: avisa en el log y
/// escribe el contenido, para poder probar el flujo sin servidor de correo.
/// </summary>
public class SmtpEmailSender : IEmailSender
{
    private readonly SmtpOptions _opt;
    private readonly ILogger<SmtpEmailSender> _log;

    public SmtpEmailSender(IOptions<SmtpOptions> opt, ILogger<SmtpEmailSender> log)
    {
        _opt = opt.Value;
        _log = log;
    }

    public async Task SendAsync(
        string toEmail, string subject, string htmlBody, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_opt.Username) || string.IsNullOrWhiteSpace(_opt.Password))
        {
            _log.LogWarning(
                "SMTP no configurado, correo NO enviado. Para: {Email}, Asunto: {Subject}",
                toEmail, subject);
            _log.LogInformation("Contenido del correo:\n{Body}", htmlBody);
            return;
        }

        try
        {
            using var msg = new MailMessage
            {
                From       = new MailAddress(_opt.FromEmail, _opt.FromName),
                Subject    = subject,
                Body       = htmlBody,
                IsBodyHtml = true,
            };
            msg.To.Add(toEmail);

            using var client = new SmtpClient(_opt.Host, _opt.Port)
            {
                EnableSsl   = _opt.EnableSsl,
                Credentials = new NetworkCredential(_opt.Username, _opt.Password),
            };

            await client.SendMailAsync(msg, ct);
            _log.LogInformation("Correo enviado a {Email}: {Subject}", toEmail, subject);
        }
        catch (Exception ex)
        {
            // No se propaga: la invitación ya quedó registrada y el usuario
            // igual puede compartir su código por otro medio.
            _log.LogError(ex, "No se pudo enviar el correo a {Email}", toEmail);
        }
    }
}
