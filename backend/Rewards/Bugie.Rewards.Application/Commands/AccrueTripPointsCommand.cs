using MediatR;
using Bugie.Rewards.Application.DTOs;

namespace Bugie.Rewards.Application.Commands;

/// <summary>
/// Acredita los puntos de un viaje completado, al pasajero y al conductor.
/// Lo dispara Trips a traves de su outbox. Es idempotente: si llega dos veces
/// el mismo TripId, la segunda no acredita nada.
/// </summary>
public record AccrueTripPointsCommand(
    Guid      TripId,
    Guid      PassengerId,
    Guid?     DriverId,
    decimal   Amount,
    string    PaymentMethod,
    /// <summary>
    /// Momento en que se completó el viaje, en UTC. Lo necesitan las
    /// promociones por día y por franja horaria. Si no llega, se usa la hora
    /// actual, que para un evento recién emitido es prácticamente la misma.
    /// </summary>
    DateTime? CompletedAt = null) : IRequest<AccrueTripPointsResultDto>;
