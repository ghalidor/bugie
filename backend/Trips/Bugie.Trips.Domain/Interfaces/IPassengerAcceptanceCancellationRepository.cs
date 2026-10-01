using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.Interfaces;

/// <summary>
/// Repositorio del histórico de cancelaciones de aceptación del pasajero.
/// Tabla inmutable: solo INSERT y SELECT.
/// </summary>
public interface IPassengerAcceptanceCancellationRepository
{
    /// <summary>Inserta un registro nuevo.</summary>
    Task AddAsync(PassengerAcceptanceCancellation row, CancellationToken ct = default);

    /// <summary>
    /// Cuenta cuántas cancelaciones tuvo el pasajero desde una fecha.
    /// Útil para métricas / detección de abuso. Hoy no se usa pero queda
    /// listo para reportes.
    /// </summary>
    Task<int> CountByPassengerSinceAsync(
        Guid passengerId, DateTime sinceUtc, CancellationToken ct = default);
}
