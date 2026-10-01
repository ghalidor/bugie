using MediatR;
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
        var user = await _users.GetByEmailAsync(cmd.Email, ct)
            ?? throw new UnauthorizedAccessException("Credenciales inválidas.");

        // No chequeamos IsActive acá: el login está abierto para que
        // conductores y pasajeros puedan loguearse aún si todavía no
        // están aprobados/verificados (necesitan loguearse para subir
        // documentos). La aprobación se refleja en IsVerified, no en
        // IsActive. IsActive solo se usa para suspender cuentas.

        if(!_hasher.Verify(cmd.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Credenciales inválidas.");

        return new AuthResponse(_tokens.GenerateToken(user), user.Role, user.FullName, user.Id);
    }
}