using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Viaje activo del usuario (enriquecido con conductor, vehiculo, posicion).
/// Con TripId: ese viaje en particular (ej. un programado que aun no es
/// activo), solo si el usuario es su pasajero o su conductor.
/// </summary>
public record GetActiveTripQuery(Guid UserId, Guid? TripId = null) : IRequest<TripDto?>;
