namespace Bugie.Landing.Domain.External;

/// <summary>
/// Envío de correos para respuestas a mensajes de contacto.
/// Separado de IEmailService (que se usa para notificar al admin cuando llega
/// un mensaje nuevo) para evitar mezclar responsabilidades y evitar colisiones
/// de tipos con la interface vieja.
/// </summary>
public interface IContactReplyMailer
{
    Task SendAsync(string toEmail, string toName, string subject, string htmlBody,
                   CancellationToken ct = default);
}
