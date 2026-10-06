using Bugie.Drivers.Domain.Enums;
using Bugie.Drivers.Domain.External;
using Bugie.Drivers.Domain.Interfaces;

namespace Bugie.Drivers.Application.DTOs;

public record AddVehicleRequest(
    string Plate, string Brand, string Model, short Year, string Color);

public record GoOnlineRequest(double Lat, double Lng);

public record UpdateLocationRequest(Guid DriverId, double Lat, double Lng,
    Guid? TripId = null, double? SpeedKmh = null, double? Heading = null);

/// <summary>
/// PUT /api/drivers/location/batch. DriverId se ignora (el conductor sale del
/// token, igual que en PUT /location). Points: max. Location:MaxBatchPoints.
/// </summary>
public record UpdateLocationBatchRequest(Guid DriverId, Guid? TripId,
    List<Bugie.Drivers.Application.Services.Location.LocationPointInput>? Points);

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
    string? ProfilePhotoUrl,
    // Aprobación por excepción: fecha límite para completar documentos (NULL = sin plazo),
    // faltas acumuladas y documentos obligatorios que faltan (se llenan en perfil propio y detalle admin).
    DateTime? DocumentsDeadline = null,
    int Strikes = 0,
    List<string>? MissingDocuments = null,
    // Rechazo/suspensión: motivo (solo si está Rejected o Suspended), fin de la
    // suspensión (hora de Perú; NULL = indefinida) y solicitud de revisión abierta.
    string? StatusReason = null,
    DateTime? SuspendedUntil = null,
    ReviewRequestDto? OpenReviewRequest = null,
    // Cuenta eliminada por el conductor (estado "Eliminada" en el admin; null = no eliminada)
    DateTime? DeletedAt = null,
    string? DeletedReason = null,
    // Placa del vehiculo activo (listado admin de conductores)
    string? ActivePlate = null);

/// <summary>Solicitud de revisión abierta del conductor (rechazado o suspendido).</summary>
public record ReviewRequestDto(Guid Id, string Message, DateTime CreatedAt);

public record DriverDetailDto(
    DriverDto Driver,
    List<VehicleDto> Vehicles,
    List<DocumentDto> Documents,
    // Info del usuario asociado (nombre real, email, teléfono).
    // Opcional para no romper consumidores viejos. Se obtiene vía HTTP
    // contra Auth en el handler del detail.
    UserInfoDto? UserInfo = null,
    // Último cambio de estado (auditoría): cuándo y quién ("Sistema" si fue automático).
    DateTime? LastStatusChangeAt = null,
    string? LastStatusChangeBy = null);

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