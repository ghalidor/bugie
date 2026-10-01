using MediatR;
using Microsoft.Extensions.Logging;
using Bugie.Landing.Application.DTOs;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

public class ReplyToContactHandler : IRequestHandler<ReplyToContactCommand, ContactReplyDto>
{
    private readonly IContactRepository _repo;
    private readonly IEmailService _email;
    private readonly ILogger<ReplyToContactHandler> _log;

    public ReplyToContactHandler(
        IContactRepository repo,
        IEmailService email,
        ILogger<ReplyToContactHandler> log)
    {
        _repo = repo;
        _email = email;
        _log = log;
    }

    public async Task<ContactReplyDto> Handle(ReplyToContactCommand cmd, CancellationToken ct)
    {
        // 1) Validar que el mensaje exista
        var msg = await _repo.GetByIdAsync(cmd.ContactId, ct)
            ?? throw new KeyNotFoundException("Mensaje no encontrado.");

        // 2) Validar payload mínimo
        if(string.IsNullOrWhiteSpace(cmd.Subject))
            throw new ArgumentException("El asunto no puede estar vacío.");
        if(string.IsNullOrWhiteSpace(cmd.Body))
            throw new ArgumentException("El cuerpo no puede estar vacío.");

        // 3) Crear el reply (en memoria todavía)
        var reply = ContactReply.Create(
            contactId: msg.Id,
            adminUserId: cmd.AdminUserId,
            adminName: cmd.AdminName,
            subject: cmd.Subject,
            body: cmd.Body);

        // 4) Intentar enviar el correo. Si falla, marcamos como 'failed' pero
        //    igual guardamos la fila para auditoría. Si va bien, queda 'sent'.
        try
        {
            // El body del admin es texto plano; lo convertimos a HTML simple
            // respetando saltos de línea + plantilla con saludo y firma.
            var htmlBody = BuildHtmlBody(msg.Name, cmd.Body);
            await _email.SendAsync(msg.Email, msg.Name, cmd.Subject, htmlBody, ct);
            _log.LogInformation("Reply enviado a {Email} (contacto {Id})", msg.Email, msg.Id);
        }
        catch(Exception ex)
        {
            _log.LogError(ex, "Error enviando reply a {Email} (contacto {Id})", msg.Email, msg.Id);
            reply.MarkFailed(ex.Message);
        }

        // 5) Guardar reply (sent o failed)
        await _repo.AddReplyAsync(reply, ct);

        // 6) Si el envío fue OK, actualizamos LastReplyAt del mensaje
        if(reply.Status == "sent")
            await _repo.UpdateLastReplyAtAsync(msg.Id, reply.CreatedAt, ct);

        return new ContactReplyDto(
            reply.Id, reply.AdminUserId, reply.AdminName, reply.Subject, reply.Body,
            reply.Status, reply.ErrorMessage, reply.CreatedAt);
    }

    /// <summary>
    /// Wrappea el body del admin en una plantilla HTML simple con saludo
    /// + firma de Bugie. Respeta saltos de línea convirtiendo \n a &lt;br&gt;.
    /// </summary>
    private static string BuildHtmlBody(string recipientName, string body)
    {
        var escapedBody = System.Net.WebUtility.HtmlEncode(body).Replace("\n", "<br/>");
        var safeName = System.Net.WebUtility.HtmlEncode(recipientName);
        return $@"
            <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;
                        color: #222; line-height: 1.5;'>
                <p>Hola {safeName},</p>
                <div style='margin: 16px 0;'>{escapedBody}</div>
                <p style='margin-top: 24px;'>Saludos,<br/><strong>Equipo Bugie</strong></p>
                <hr style='border: none; border-top: 1px solid #eee; margin: 24px 0;'/>
                <p style='font-size: 12px; color: #888;'>
                    Este correo es una respuesta a tu mensaje enviado desde la web de Bugie.
                </p>
            </div>";
    }
}