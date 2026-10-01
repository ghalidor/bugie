using MediatR;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

public class ForgotPasswordHandler : IRequestHandler<ForgotPasswordCommand, string>
{
    private readonly IUserRepository _users;
    public ForgotPasswordHandler(IUserRepository users) => _users = users;

    public async Task<string> Handle(ForgotPasswordCommand cmd, CancellationToken ct)
    {
        // No revelamos si el correo existe (seguridad)
        var user = await _users.GetByEmailAsync(cmd.Email, ct);
        if (user is null)
            return "Si el correo existe en nuestro sistema, recibirás instrucciones pronto.";

        // TODO en producción: generar token, guardar, enviar email
        return "Si el correo existe en nuestro sistema, recibirás instrucciones pronto.";
    }
}
