namespace Bugie.Rewards.Domain.External;

/// <summary>
/// Push a enviar. 'Route' es la pantalla a la que navega la app al tocarlo.
/// Mismo contrato que usa Trips, para que Flutter no tenga que distinguir
/// de que modulo vino la notificacion.
/// </summary>
public record FcmPushMessage(
    string Title,
    string Body,
    string? Route,
    Dictionary<string, string>? ExtraData = null);

/// <summary>
/// Envia push notifications. Recibe el id del USUARIO, no el token:
/// la implementacion se encarga de buscar los tokens de sus dispositivos.
///
/// Nunca lanza excepciones hacia arriba. Un push que no salio no puede
/// romper el vencimiento de puntos.
/// </summary>
public interface IFcmSender
{
    Task SendToUserAsync(Guid userId, FcmPushMessage message, CancellationToken ct = default);
    Task SendToUsersAsync(IEnumerable<Guid> userIds, FcmPushMessage message, CancellationToken ct = default);
}
