using System.Net;
using System.Net.Mail;
using Bugie.Drivers.Domain.External;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bugie.Drivers.Infrastructure.Email;

public class SmtpOptions
{
    public string Host { get; set; } = "smtp.gmail.com";
    public int Port { get; set; } = 587;
    public bool EnableSsl { get; set; } = true;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FromEmail { get; set; } = string.Empty;
    public string FromName { get; set; } = "Bugie";
}

/// <summary>
/// Envía correos vía SMTP (Gmail por defecto).
/// Si falla, NO tira excepción — solo loguea. Así no se rompe el flujo
/// de negocio si SMTP está caído o mal configurado.
/// </summary>
public class SmtpEmailService : IEmailService
{
    private readonly SmtpOptions _opt;
    private readonly ILogger<SmtpEmailService> _log;

    public SmtpEmailService(IOptions<SmtpOptions> opt, ILogger<SmtpEmailService> log)
    {
        _opt = opt.Value;
        _log = log;
    }

    public async Task SendAsync(string toEmail, string toName, string subject, string htmlBody,
                                 CancellationToken ct = default)
    {
        if(string.IsNullOrWhiteSpace(_opt.Username) || string.IsNullOrWhiteSpace(_opt.Password))
        {
            _log.LogWarning("SMTP no configurado, correo NO enviado. To: {Email}, Subject: {Subject}",
                            toEmail, subject);
            return;
        }

        try
        {
            using var msg = new MailMessage
            {
                From = new MailAddress(_opt.FromEmail, _opt.FromName),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true,
            };
            msg.To.Add(new MailAddress(toEmail, toName));

            using var client = new SmtpClient(_opt.Host, _opt.Port)
            {
                EnableSsl = _opt.EnableSsl,
                Credentials = new NetworkCredential(_opt.Username, _opt.Password),
            };

            await client.SendMailAsync(msg, ct);
            _log.LogInformation("Correo enviado a {Email}: {Subject}", toEmail, subject);
        }
        catch(Exception ex)
        {
            _log.LogError(ex, "Error enviando correo a {Email}: {Subject}", toEmail, subject);
        }
    }
}