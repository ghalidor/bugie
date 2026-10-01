namespace Bugie.Drivers.Domain.External;

/// <summary>
/// Abstracción para envío de correos desde el módulo Drivers.
/// Implementada en Infrastructure (SmtpEmailService).
/// </summary>
public interface IEmailService
{
    Task SendAsync(string toEmail, string toName, string subject, string htmlBody,
                   CancellationToken ct = default);
}