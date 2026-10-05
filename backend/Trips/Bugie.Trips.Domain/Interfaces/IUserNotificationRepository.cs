using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Bandeja de notificaciones del usuario (pasajero y conductor).
/// La escribe el FcmSender (singleton), por eso la implementacion abre su
/// propia conexion en cada llamada en vez de usar la conexion scoped.
/// </summary>
public interface IUserNotificationRepository
{
    /// <summary>
    /// Guarda el mismo aviso para varios usuarios. Devuelve userId -> id de la
    /// notificacion creada (se manda en el push como "notification_id").
    /// </summary>
    Task<Dictionary<Guid, Guid>> AddForUsersAsync(
        IReadOnlyCollection<Guid> userIds, string title, string body,
        string? type, string? alertType, string? route, string? dataJson,
        CancellationToken ct = default);

    /// <summary>Pagina de avisos del usuario, lo mas reciente primero.</summary>
    Task<(List<UserNotification> Items, int Total, int Unread)> GetPageAsync(
        Guid userId, int page, int pageSize, CancellationToken ct = default);

    Task<int> CountUnreadAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Marca leida una notificacion del usuario. False si no existe o es de
    /// otro usuario. Si ya estaba leida devuelve true y conserva la fecha.
    /// </summary>
    Task<bool> MarkReadAsync(Guid id, Guid userId, CancellationToken ct = default);

    /// <summary>Marca todas como leidas. Devuelve cuantas cambiaron.</summary>
    Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default);
}
