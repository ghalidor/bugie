using MediatR;
using Bugie.Trips.Application.DTOs;

namespace Bugie.Trips.Application.Queries;

/// <summary>
/// Mapa del inicio del conductor (GET /api/trips/driver/demand):
///   * Zones: demanda de los ultimos 30 min agrupada en celdas de ~500 m.
///   * Nearby: hasta 10 solicitudes que este conductor ve ahora en su lista.
/// </summary>
public record GetDriverDemandQuery(Guid DriverUserId, double Lat, double Lng, double RadiusKm)
    : IRequest<DriverDemandDto>;
