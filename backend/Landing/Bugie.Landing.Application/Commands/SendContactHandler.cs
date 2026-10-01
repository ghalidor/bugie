using MediatR;
using Bugie.Landing.Domain.Entities;
using Bugie.Landing.Domain.Interfaces;

namespace Bugie.Landing.Application.Commands;

public class SendContactHandler : IRequestHandler<SendContactCommand, Guid>
{
    private readonly IContactRepository _contacts;
    private readonly IEmailService _email;

    public SendContactHandler(IContactRepository contacts, IEmailService email)
        => (_contacts, _email) = (contacts, email);

    public async Task<Guid> Handle(SendContactCommand cmd, CancellationToken ct)
    {
        if(string.IsNullOrWhiteSpace(cmd.Name))
            throw new ArgumentException("El nombre es requerido.");
        if(string.IsNullOrWhiteSpace(cmd.Email) || !cmd.Email.Contains('@'))
            throw new ArgumentException("Correo invalido.");
        if(string.IsNullOrWhiteSpace(cmd.Message) || cmd.Message.Length < 10)
            throw new ArgumentException("El mensaje debe tener al menos 10 caracteres.");

        var msg = ContactMessage.Create(cmd.Name, cmd.Email, cmd.Subject, cmd.Message);
        await _contacts.AddAsync(msg, ct);

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
