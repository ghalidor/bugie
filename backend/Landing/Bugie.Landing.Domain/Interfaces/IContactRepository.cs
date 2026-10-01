using Bugie.Landing.Domain.Entities;

namespace Bugie.Landing.Domain.Interfaces;

public interface IContactRepository
{
    // ??? Mensajes ??????????????????????????????????????????????????????
    Task AddAsync(ContactMessage msg, CancellationToken ct = default);

    /// <summary>Para el widget de Settings: solo los no leídos.</summary>
    Task<List<ContactMessage>> GetUnreadAsync(CancellationToken ct = default);

    /// <summary>Detalle de un mensaje por Id.</summary>
    Task<ContactMessage?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Lista paginada para el admin con filtro de estado.
    /// filter: 'all' | 'unread' | 'read'.
    /// </summary>
    Task<(List<ContactMessage> items, int total)> GetPagedAsync(
        string filter, int skip, int take, CancellationToken ct = default);

    /// <summary>Marca un mensaje como leído. Idempotente.</summary>
    Task MarkAsReadAsync(Guid id, Guid? adminUserId, CancellationToken ct = default);

    /// <summary>Marca un mensaje como NO leído. Idempotente.</summary>
    Task MarkAsUnreadAsync(Guid id, CancellationToken ct = default);

    /// <summary>Actualiza la columna LastReplyAt del mensaje.</summary>
    Task UpdateLastReplyAtAsync(Guid id, DateTime at, CancellationToken ct = default);

    // ??? Respuestas ????????????????????????????????????????????????????
    Task AddReplyAsync(ContactReply reply, CancellationToken ct = default);

    /// <summary>Devuelve todas las respuestas de un mensaje, más nuevas primero.</summary>
    Task<List<ContactReply>> GetRepliesByContactAsync(
        Guid contactId, CancellationToken ct = default);
}
