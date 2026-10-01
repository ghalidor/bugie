using Bugie.Trips.Domain.Enums;

namespace Bugie.Trips.Application.DTOs;

public record WaypointRequest(string Address, double Lat, double Lng);
public record WaypointDto(Guid Id, string Address, double Lat, double Lng, int SortOrder);

public record CreateTripRequest(
    string OriginAddress, double OriginLat, double OriginLng,
    string DestAddress, double DestLat, double DestLng,
    decimal EstimatedFare, string PaymentMethod,
    List<WaypointRequest>? Waypoints = null,
    // Envio (Delivery). Opcionales; para Ride quedan por defecto.
    ServiceType ServiceType = ServiceType.Ride,
    string? PackageDescription = null,
    decimal? PackageWeightKg = null,
    bool PackageIsFragile = false,
    string? PackageDetails = null);

public record TripDto(
    Guid Id,
    Guid PassengerId,
    Guid? DriverId,
    string OriginAddress,
    double OriginLat,
    double OriginLng,
    string DestAddress,
    double DestLat,
    double DestLng,
    decimal EstimatedFare,
    decimal? ProposedFare,
    Guid? ProposedDriverId,
    decimal? FinalFare,
    string PaymentMethod,
    TripStatus Status,
    DateTime CreatedAt,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    List<WaypointDto>? Waypoints = null,
    // Última posición conocida del conductor asignado (si hay).
    // Solo se rellena cuando el viaje está accepted/inProgress/sosActive.
    double? DriverCurrentLat = null,
    double? DriverCurrentLng = null,
    DateTime? DriverLocationAt = null,
    // Envio (Delivery)
    ServiceType ServiceType = ServiceType.Ride,
    string? PackageDescription = null,
    decimal? PackageWeightKg = null,
    bool PackageIsFragile = false,
    string? PackageDetails = null,
    bool PickupVerified = false,
    string? PickupObservation = null,
    // Datos del pasajero (para que el conductor los vea en la solicitud)
    string? PassengerName = null,
    string? PassengerPhotoUrl = null,
    // Datos del conductor asignado (para el seguimiento del pasajero)
    string? DriverName = null,
    string? DriverPhotoUrl = null,
    decimal? DriverRating = null,
    string? VehiclePlate = null,
    string? VehicleBrand = null,
    string? VehicleModel = null,
    string? VehicleColor = null,
    string? VehiclePhotoUrl = null,
    // Estrellas que el pasajero dio a ESTE viaje (historial del conductor)
    int? PassengerStars = null);

public record SosRequest(Guid TripId, double Lat, double Lng);

/// <summary>
/// Body del PUT /trips/sos/{id}/resolve. El admin debe explicar por qué
/// desactiva la alerta (queda persistido para auditoría).
/// </summary>
public record ResolveSosRequest(string Reason);

/// <summary>
/// El pasajero reporta su ubicación durante el viaje.
/// </summary>
public record UpdatePassengerLocationRequest(double Lat, double Lng);

/// <summary>
/// Vista admin de un viaje activo. Incluye lo necesario para el mapa de monitoreo:
/// posiciones, origen/destino para la ruta, y nombres para mostrar en la lista.
/// </summary>
public record LivePassengerDto(
    Guid TripId,
    Guid PassengerId,
    Guid? DriverId,
    int Status,
    double Lat,
    double Lng,
    DateTime? UpdatedAt,
    double OriginLat,
    double OriginLng,
    double DestLat,
    double DestLng,
    double? DriverLat,
    double? DriverLng,
    string PassengerName,
    string? PassengerPhone,
    string? PassengerPhotoUrl,
    string? DriverName,
    string? DriverPhone);
public record ProposeFareRequest(decimal ProposedFare);
public record CompleteTripRequest(decimal FinalFare);

public record ProposalDto(
    Guid Id,
    Guid TripId,
    Guid DriverId,
    decimal Fare,
    string Status,
    DateTime CreatedAt,
    string DriverName,
    string? VehiclePlate,
    string? VehicleBrand,
    string? VehicleModel,
    string? VehicleColor,
    string Trend,
    decimal? PreviousFare,
    string ProposedByRole = "driver",
    string? RejectedBy = null,
    string? DriverPhotoUrl = null);   // "passenger" | "driver" | null � NUEVO

public record ProposalHistoryDto(
    Guid Id,
    decimal Fare,
    string Status,
    DateTime CreatedAt,
    string ProposedByRole = "driver",
    string? RejectedBy = null);   // NUEVO