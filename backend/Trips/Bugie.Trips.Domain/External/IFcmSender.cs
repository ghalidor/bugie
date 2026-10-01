namespace Bugie.Trips.Domain.External;

/// <summary>
/// DTO de un push notification a enviar. Contiene los datos visibles al
/// usuario (title/body) y los datos internos (route) que el cliente Flutter
/// usa al tocar la notificación para navegar a la pantalla correcta.
/// </summary>
public record FcmPushMessage(
    string Title,
    string Body,
    string? Route,           // ej. "/driver/requests" o null si no navega
    Dictionary<string, string>? ExtraData = null
);

/// <summary>
/// Servicio que envía push notifications vía Firebase Cloud Messaging.
///
/// Recibe el ID del USUARIO destino (no el token). El sender se encarga
/// de buscar los tokens del usuario y mandar el push a cada uno (un
/// usuario puede tener varios dispositivos).
///
/// Si un token está inválido (UNREGISTERED), debe borrarlo de la BD
/// para no seguir intentándolo.
/// </summary>
public interface IFcmSender
{
    /// <summary>
    /// Manda el push a UN usuario (a todos sus dispositivos registrados).
    /// </summary>
    Task SendToUserAsync(Guid userId, FcmPushMessage message, CancellationToken ct = default);

    /// <summary>
    /// Manda el mismo push a varios usuarios. Es más eficiente que llamar
    /// SendToUserAsync N veces porque agrupa la consulta de tokens.
    /// </summary>
    Task SendToUsersAsync(IEnumerable<Guid> userIds, FcmPushMessage message, CancellationToken ct = default);
}