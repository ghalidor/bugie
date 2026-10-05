namespace Bugie.Trips.Application.DTOs;

/// <summary>
/// Versión enriquecida de TripDto que incluye info del conductor y vehículo.
/// Usada en el historial del pasajero. Si el viaje no tiene conductor asignado
/// (status pendiente o cancelado), los campos del conductor/vehículo van en null.
/// </summary>
public record EnrichedTripDto(
    // ── Datos del viaje ──────────────────────────────────────────
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
    decimal? FinalFare,
    string PaymentMethod,
    int Status,
    DateTime CreatedAt,
    DateTime? StartedAt,
    DateTime? CompletedAt,

    // ── Datos del conductor (null si aún no fue asignado) ────────
    string? DriverFullName,
    string? DriverPhotoUrl,
    decimal? DriverRating,
    int? DriverTotalRatings,

    // ── Datos del vehículo ───────────────────────────────────────
    string? VehiclePlate,
    string? VehicleBrand,
    string? VehicleModel,
    string? VehicleColor,
    short? VehicleYear,
    string? VehiclePhotoUrl,

    // ── Categoría: "city_ride" (viaje) o "delivery" (envío).
    string Category,

    // ── Envío (null / false en viajes) ─────────────────────────────────
    int ServiceType = 0,
    string? PackageDescription = null,
    decimal? PackageWeightKg = null,
    bool PackageIsFragile = false,
    string? PackageDetails = null,
    string? RecipientName = null,
    string? RecipientPhone = null,
    bool PickupVerified = false,
    string? DeliveryReceivedBy = null,
    DateTime? DeliveryConfirmedAt = null,

    // ── Cancelación (quién y por qué) ──────────────────────────────────
    string? CancelledBy = null,
    string? CancelReason = null,

    // ── Programado (null = viaje "ahora") ──────────────────────────────
    DateTime? ScheduledAt = null,
    DateTime? DriverArrivedAt = null,
    // El conductor del programado no llegó: se puede cancelar o republicar.
    bool DriverLate = false);