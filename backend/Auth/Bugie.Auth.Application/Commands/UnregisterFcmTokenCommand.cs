using MediatR;
using Bugie.Auth.Domain.Interfaces;

namespace Bugie.Auth.Application.Commands;

/// <summary>
/// Borra el token FCM al hacer logout para que ese dispositivo no siga
/// recibiendo notificaciones del usuario anterior.
///
/// Modos:
///   - Token != null  → borra solo ESE token (típico al hacer logout
///     desde el dispositivo actual).
///   - Token == null  → borra TODOS los tokens del usuario (logout
///     "cerrar sesión en todos los dispositivos").
/// </summary>
public record UnregisterFcmTokenCommand(
    Guid UserId,
    string? Token
) : IRequest;

public class UnregisterFcmTokenHandler : IRequestHandler<UnregisterFcmTokenCommand>
{
    private readonly IUserFcmTokenRepository _tokens;
    public UnregisterFcmTokenHandler(IUserFcmTokenRepository tokens) => _tokens = tokens;

    public async Task Handle(UnregisterFcmTokenCommand cmd, CancellationToken ct)
    {
        if(!string.IsNullOrWhiteSpace(cmd.Token))
        {
            // Por seguridad: verificamos que el token efectivamente
            // pertenezca a este usuario antes de borrarlo.
            var existing = await _tokens.GetByTokenAsync(cmd.Token!, ct);
            if(existing is not null && existing.UserId == cmd.UserId)
            {
                await _tokens.DeleteByTokenAsync(cmd.Token!, ct);
            }
        }
        else
        {
            await _tokens.DeleteByUserIdAsync(cmd.UserId, ct);
        }
    }
}
