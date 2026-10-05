using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Trae los viajes pending visibles para un conductor específico.
/// Solo se muestran los viajes cercanos a su posición (radio configurable
/// en appsettings.json ? TripFiltering.NearbyRadiusMeters), excepto los
/// viajes donde el conductor ya envió una propuesta — esos se muestran
/// siempre para no perder la negociación en curso.
/// SkipDetails = true: solo la lista visible, sin pasajeros ni waypoints
/// (la usa el mapa de demanda del conductor).
/// </summary>
public record GetPendingTripsQuery(Guid DriverUserId, bool SkipDetails = false) : IRequest<List<TripDto>>;
