using Bugie.Drivers.Domain.Entities;

namespace Bugie.Drivers.Domain.Interfaces;

/// <summary>Recorridos consolidados (drivers.trippaths).</summary>
public interface ITripPathRepository
{
    Task<TripPath?> GetAsync(Guid tripId, CancellationToken ct = default);

    /// <summary>
    /// Arma (o rearma) el recorrido del viaje desde drivers.locationhistory
    /// (funcion drivers.consolidate_trip_path). Devuelve la cantidad de puntos;
    /// 0 si el viaje no tiene GPS.
    /// </summary>
    Task<int> ConsolidateAsync(Guid tripId, CancellationToken ct = default);

    /// <summary>
    /// Viajes con GPS crudo cuyo ultimo punto es anterior a la fecha dada y que
    /// no tienen recorrido consolidado (o lo tienen con menos puntos).
    /// </summary>
    Task<List<Guid>> GetPendingConsolidationAsync(DateTime lastPointBeforeUtc, CancellationToken ct = default);
}
