using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Historial de avisos en vivo del panel admin y su estado de lectura por admin.
///
/// Visibilidad: un admin ve un aviso si el aviso no pide permiso
/// (Permission NULL) o si el permiso esta en su lista. Permission puede
/// traer varios separados por coma: basta tener uno (ej. el SOS). Para super_admin
/// Auth devuelve el catalogo completo, asi que ve todo.
///
/// La usa SignalRAdminNotifier (scoped) y controladores; la implementacion
/// abre su propia conexion en cada llamada (singleton).
/// </summary>
public interface IAdminNotificationRepository
{
    /// <summary>Guarda un aviso y devuelve su id.</summary>
    Task<Guid> AddAsync(string type, string title, string? message, string? link,
                        string? permission, string? dataJson, CancellationToken ct = default);

    /// <summary>
    /// Pagina del historial visible para el admin, lo mas reciente primero.
    /// fromUtc inclusive, toUtc exclusivo. Total respeta los filtros;
    /// Unread es el total de no leidos visibles (sin filtros).
    /// </summary>
    Task<(List<AdminNotification> Items, int Total, int Unread)> GetPageAsync(
        Guid adminUserId, IReadOnlyCollection<string> permissions,
        string? type, DateTime? fromUtc, DateTime? toUtc, bool unreadOnly,
        int page, int pageSize, CancellationToken ct = default);

    Task<int> CountUnreadAsync(Guid adminUserId, IReadOnlyCollection<string> permissions,
                               CancellationToken ct = default);

    /// <summary>
    /// Marca leido un aviso para el admin. False si no existe o no lo puede ver.
    /// Si ya estaba leido devuelve true y conserva la fecha.
    /// </summary>
    Task<bool> MarkReadAsync(Guid id, Guid adminUserId, IReadOnlyCollection<string> permissions,
                             CancellationToken ct = default);

    /// <summary>Marca leidos todos los avisos visibles. Devuelve cuantos cambiaron.</summary>
    Task<int> MarkAllReadAsync(Guid adminUserId, IReadOnlyCollection<string> permissions,
                               CancellationToken ct = default);
}
