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
    string? RecipientPhone = null)
    : IRequest<TripDto>;
