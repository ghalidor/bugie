using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

public interface IOutboxRepository
{
    Task AddAsync(OutboxEvent evt, CancellationToken ct = default);

    /// <summary>Eventos pendientes, los mas antiguos primero.</summary>
    Task<List<OutboxEvent>> GetPendingAsync(int limit, CancellationToken ct = default);

    Task MarkSentAsync(long id, CancellationToken ct = default);

    /// <summary>
    /// Suma un intento, guarda el error y programa el proximo intento con
    /// espera creciente (retryDelay, hasta maxDelay).
    ///
    /// permanent = true (el destino lo rechazo): despues de maxAttempts la fila
    /// pasa a 'failed' y deja de reintentarse, para que un error permanente no
    /// llene el log para siempre. permanent = false (destino caido): sigue
    /// 'pending' y se reintenta hasta que el destino vuelva; asi no se pierde
    /// un cupon usado ni unos puntos por una caida larga.
    /// </summary>
    Task MarkAttemptAsync(long id, string error, int maxAttempts, bool permanent,
        TimeSpan retryDelay, TimeSpan maxDelay, CancellationToken ct = default);
}
