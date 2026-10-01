using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

public interface IOutboxRepository
{
    Task AddAsync(OutboxEvent evt, CancellationToken ct = default);

    /// <summary>Eventos pendientes, los mas antiguos primero.</summary>
    Task<List<OutboxEvent>> GetPendingAsync(int limit, CancellationToken ct = default);

    Task MarkSentAsync(long id, CancellationToken ct = default);

    /// <summary>
    /// Suma un intento y guarda el error. Despues de maxAttempts la fila pasa a
    /// 'failed' y deja de reintentarse, para que un error permanente no llene
    /// el log para siempre.
    /// </summary>
    Task MarkAttemptAsync(long id, string error, int maxAttempts, CancellationToken ct = default);
}
