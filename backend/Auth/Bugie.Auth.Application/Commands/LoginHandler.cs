using MediatR;
using Bugie.Auth.Application.Common;
using Bugie.Auth.Application.DTOs;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

public class LoginHandler : IRequestHandler<LoginCommand, AuthResponse>
{
    private readonly IUserRepository _users;
    private readonly ITokenService _tokens;
    private readonly IPasswordHasher _hasher;

    public LoginHandler(IUserRepository users, ITokenService tokens, IPasswordHasher hasher)
        => (_users, _tokens, _hasher) = (users, tokens, hasher);

    public async Task<AuthResponse> Handle(LoginCommand cmd, CancellationToken ct)
    {
        // LoginValidator no corre en el pipeline: se valida aquí.
        if(string.IsNullOrWhiteSpace(cmd.Email) || string.IsNullOrWhiteSpace(cmd.Password))
            throw new UnauthorizedAccessException("Credenciales inválidas.");

        var user = await _users.GetByEmailAsync(cmd.Email, ct)
            ?? throw new UnauthorizedAccessException("Credenciales inválidas.");

        // No chequeamos IsActive acá: el login está abierto para que
        // conductores y pasajeros puedan loguearse aún si todavía no
        // están aprobados/verificados (necesitan loguearse para subir
        // documentos). La aprobación se refleja en IsVerified, no en
        // IsActive. La desactivacion por el admin va en DeactivatedAt (abajo).

        if(!_hasher.Verify(cmd.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Credenciales inválidas.");

        // Cuenta eliminada: se avisa solo con la contraseña correcta (no revela cuentas).
        if(user.IsDeleted)
            throw new UnauthorizedAccessException(AccountMessages.Deleted);

        // Cuenta desactivada por el admin (tambien solo con la contrasena correcta).
        if(user.IsDeactivated)
            throw new UnauthorizedAccessException(AccountMessages.Deactivated);

        return new AuthResponse(_tokens.GenerateToken(user), user.Role, user.FullName, user.Id);
    }
}