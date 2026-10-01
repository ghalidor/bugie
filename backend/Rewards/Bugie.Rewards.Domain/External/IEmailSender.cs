namespace Bugie.Rewards.Domain.External;

/// <summary>
/// Envío de correo. Si no está configurado, NO debe lanzar excepción: se
/// registra en el log y se sigue. Un correo que no sale no puede tumbar una
/// invitación ni, peor, un registro.
/// </summary>
public interface IEmailSender
{
    Task SendAsync(string toEmail, string subject, string htmlBody,
                   CancellationToken ct = default);
}
