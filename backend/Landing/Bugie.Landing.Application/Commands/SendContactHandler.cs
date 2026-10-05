using MediatR;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

public class SendContactHandler : IRequestHandler<SendContactCommand, Guid>
{
    private readonly IContactRepository _contacts;
    private readonly IEmailService _email;
    private readonly IAdminEventsPublisher _adminEvents;

    public SendContactHandler(IContactRepository contacts, IEmailService email,
                              IAdminEventsPublisher adminEvents)
        => (_contacts, _email, _adminEvents) = (contacts, email, adminEvents);

    public async Task<Guid> Handle(SendContactCommand cmd, CancellationToken ct)
    {
        if(string.IsNullOrWhiteSpace(cmd.Name))
            throw new ArgumentException("El nombre es requerido.");
        if(string.IsNullOrWhiteSpace(cmd.Email) || !cmd.Email.Contains('@'))
            throw new ArgumentException("Correo invalido.");
        if(string.IsNullOrWhiteSpace(cmd.Message) || cmd.Message.Trim().Length < 10)
            throw new ArgumentException("El mensaje debe tener al menos 10 caracteres.");
        if(string.IsNullOrWhiteSpace(cmd.Subject))
            throw new ArgumentException("El asunto es requerido.");
        // Mismos limites que las columnas de landing.contactmessages (si no, la BD daria 500).
        if(cmd.Name.Trim().Length > 120)
            throw new ArgumentException("El nombre no puede superar 120 caracteres.");
        if(cmd.Email.Trim().Length > 200)
            throw new ArgumentException("El correo no puede superar 200 caracteres.");
        if(cmd.Subject.Length > 60)
            throw new ArgumentException("El asunto no puede superar 60 caracteres.");
        if(cmd.Message.Trim().Length > 2000)
            throw new ArgumentException("El mensaje no puede superar 2000 caracteres.");

        var msg = ContactMessage.Create(cmd.Name, cmd.Email, cmd.Subject, cmd.Message);
        await _contacts.AddAsync(msg, ct);

        // Aviso en vivo al panel admin (Centro de avisos). Fire-and-forget.
        _adminEvents.Publish("contact_message",
            "Nuevo mensaje de contacto",
            "Llegó un mensaje nuevo desde el sitio web.",
            "/admin/mensajes", "view:messages");

        try
        {
            await _email.SendContactEmailAsync(
                cmd.Name, cmd.Email, cmd.Subject, cmd.Message, ct);
        }
        catch(Exception ex)
        {
            Console.WriteLine($"[Email] Error al enviar: {ex.Message}");
        }

        return msg.Id;
    }
}
