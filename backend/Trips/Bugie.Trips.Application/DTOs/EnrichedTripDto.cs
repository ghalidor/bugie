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

    // ── Categoría: por ahora todos son city_ride. Delivery viene después.
    string Category);