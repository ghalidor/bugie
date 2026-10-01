using Bugie.Drivers.Domain.Enums;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.DTOs;

public record RegisterDriverRequest(Guid UserId);

public record AddVehicleRequest(
    string Plate, string Brand, string Model, short Year, string Color);

public record GoOnlineRequest(double Lat, double Lng);

public record UpdateLocationRequest(Guid DriverId, double Lat, double Lng,
    Guid? TripId = null, double? SpeedKmh = null, double? Heading = null);

public record AddReviewRequest(
    Guid DriverId, Guid PassengerId, Guid TripId, byte Rating, string? Comment);

public record DriverDto(
    Guid Id,
    Guid UserId,
    string FullName,
    DriverStatus Status,
    bool IsOnline,
    double? CurrentLat,
    double? CurrentLng,
    decimal Rating,
    int TotalRatings,
    bool HasActiveTrip,
    DateTime CreatedAt,
    DateTime? ApprovedAt,
    string? ProfilePhotoUrl);

public record DriverDetailDto(
    DriverDto Driver,
    List<VehicleDto> Vehicles,
    List<DocumentDto> Documents,
    // Info del usuario asociado (nombre real, email, teléfono).
    // Opcional para no romper consumidores viejos. Se obtiene vía HTTP
    // contra Auth en el handler del detail.
    UserInfoDto? UserInfo = null);

public record VehicleDto(
    Guid Id, Guid DriverId, string Plate, string Brand,
    string Model, short Year, string Color, bool IsActive,
    string? PhotoUrl);   // ? NUEVO

public record DocumentDto(
    Guid Id, Guid DriverId, string DocType,
    string FileUrl, string Status, DateTime? ExpiresAt,
    // Campos adicionales para que el admin pueda mostrar preview
    // y aprobar/rechazar documentos uno por uno desde Verification.
    string? OriginalFileName = null,
    string? MimeType = null,
    string? RejectionReason = null);

public record NearbyDriverResponse(
    Guid DriverId,
    Guid UserId,
    double Lat,
    double Lng,
    double DistanceKm,
    decimal Rating,
    string? VehiclePlate,
    string? VehicleModel,
    string? VehicleColor);

public record DriverEarningsSummary(
    Guid DriverId,
    decimal TotalEarnings,
    int TotalTrips,
    decimal EarningsThisMonth);