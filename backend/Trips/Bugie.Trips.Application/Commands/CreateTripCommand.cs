using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Enums;

namespace Bugie.Trips.Application.Commands;

public record CreateTripCommand(
    Guid    PassengerId,
    string  OriginAddress, double OriginLat, double OriginLng,
    string  DestAddress,   double DestLat,   double DestLng,
    decimal EstimatedFare, string PaymentMethod,
    List<WaypointRequest>? Waypoints = null,
    ServiceType ServiceType = ServiceType.Ride,
    string? PackageDescription = null,
    decimal? PackageWeightKg = null,
    bool PackageIsFragile = false,
    string? PackageDetails = null,
    string? RecipientName = null,
    string? RecipientPhone = null,
    // false = no avisar a los conductores al crear (envios: se avisa recien
    // cuando las fotos del paquete ya estan guardadas).
    bool NotifyDrivers = true,
    // Programado: hora del recojo en UTC (null = ahora).
    DateTime? ScheduledAt = null)
    : IRequest<TripDto>;

/// Avisa (push) a los conductores cercanos que hay una solicitud nueva.
/// Lo usa el envio despues de guardar las fotos del paquete.
public record NotifyNearbyDriversCommand(Guid TripId) : IRequest;
