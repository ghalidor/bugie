using Bugie.Trips.Domain.Enums;

namespace Bugie.Trips.Application.DTOs;

/// <summary>Respuesta del mapa de demanda del conductor. Sin datos del pasajero.</summary>
public record DriverDemandDto(
    DateTime GeneratedAt,
    List<DemandZoneDto> Zones,
    List<DemandNearbyDto> Nearby);

/// <summary>Celda de ~500 m: total de solicitudes y separado (envios / viajes).</summary>
public record DemandZoneDto(double Lat, double Lng, int Count, int Deliveries, int Trips);

/// <summary>
/// Solicitud cercana. DistanceKm = distancia en linea recta desde (lat, lng)
/// del conductor hasta el punto de recojo.
/// </summary>
public record DemandNearbyDto(
    Guid Id,
    ServiceType ServiceType,
    double OriginLat,
    double OriginLng,
    string OriginAddress,
    string DestAddress,
    decimal EstimatedFare,
    double DistanceKm,
    DateTime CreatedAt);
