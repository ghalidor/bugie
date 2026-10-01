using MediatR;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

public class ResetPasswordHandler : IRequestHandler<ResetPasswordCommand, bool>
{
    private readonly IUserRepository _users;
    private readonly IPasswordHasher  _hasher;

    public ResetPasswordHandler(IUserRepository users, IPasswordHasher hasher)
        => (_users, _hasher) = (users, hasher);

    public Task<bool> Handle(ResetPasswordCommand cmd, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(cmd.Token) || string.IsNullOrWhiteSpace(cmd.NewPassword))
            throw new ArgumentException("Token y nueva contraseña son requeridos.");

        if (cmd.NewPassword.Length < 8)
            throw new ArgumentException("La contraseña debe tener al menos 8 caracteres.");

        // TODO: validar token en auth.RefreshTokens, obtener userId, actualizar hash
        return Task.FromResult(false);
    }
}
