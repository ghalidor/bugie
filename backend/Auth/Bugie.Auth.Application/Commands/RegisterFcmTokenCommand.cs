using MediatR;
using Bugie.Auth.Domain.Entities;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

/// <summary>
/// Registra (o actualiza) el token FCM de un dispositivo para un usuario.
///
/// Si el token ya existía:
///   - Y pertenece al MISMO usuario: solo se actualiza UpdatedAt.
///   - Y pertenece a OTRO usuario: cambia de dueño (el usuario anterior
///     hizo logout y el dispositivo lo está usando otro). Esto evita
///     duplicados por la UNIQUE constraint en Token.
///
/// Si no existía: se crea uno nuevo.
/// </summary>
public record RegisterFcmTokenCommand(
    Guid UserId,
    string Token,
    string Platform
) : IRequest;

public class RegisterFcmTokenHandler : IRequestHandler<RegisterFcmTokenCommand>
{
    private readonly IUserFcmTokenRepository _tokens;
    public RegisterFcmTokenHandler(IUserFcmTokenRepository tokens) => _tokens = tokens;

    public async Task Handle(RegisterFcmTokenCommand cmd, CancellationToken ct)
    {
        if(string.IsNullOrWhiteSpace(cmd.Token))
            throw new ArgumentException("Token vacío.");

        var platform = (cmd.Platform ?? "android").ToLowerInvariant();
        if(platform != "android" && platform != "ios")
            platform = "android";

        var existing = await _tokens.GetByTokenAsync(cmd.Token, ct);
        if(existing is null)
        {
            // Token nuevo: crear.
            var token = UserFcmToken.Create(cmd.UserId, cmd.Token, platform);
            await _tokens.AddAsync(token, ct);
        }
        else
        {
            // Token ya existe: refrescar dueño + UpdatedAt.
            existing.UpdateOwner(cmd.UserId, platform);
            await _tokens.UpdateAsync(existing, ct);
        }
    }
}
