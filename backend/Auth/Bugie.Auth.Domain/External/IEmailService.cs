namespace Bugie.Auth.Domain.External;

public interface IEmailService {
    Task SendAsync(string toEmail, string toName, string subject, string htmlBody,
                   CancellationToken ct = default);
}