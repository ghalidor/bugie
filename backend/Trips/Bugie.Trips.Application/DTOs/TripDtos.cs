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
    string? PackageDetails = null,
    // Envio: a quien se entrega (obligatorio si es envio)
    string? RecipientName = null,
    string? RecipientPhone = null,
    // Programado: hora del recojo (sin zona = hora de Peru). null = ahora.
    DateTime? ScheduledAt = null);

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
    int? PassengerStars = null,
    // Cupon aplicado al viaje (null si no hay)
    string? CouponCode = null,
    decimal? DiscountAmount = null,
    decimal? FareBeforeDiscount = null,
    // Cuando el conductor acepto y cuando aviso que llego al punto de recojo
    DateTime? AcceptedAt = null,
    DateTime? DriverArrivedAt = null,
    // Si se cancelo: quien (passenger | driver | admin) y el motivo
    string? CancelledBy = null,
    string? CancelReason = null,
    DateTime? CancelledAt = null,
    // Envio: destinatario y confirmacion de entrega
    string? RecipientName = null,
    string? RecipientPhone = null,
    string? DeliveryReceivedBy = null,
    DateTime? DeliveryConfirmedAt = null,
    // Programado: hora del recojo (null = viaje "ahora").
    DateTime? ScheduledAt = null,
    // Programado que ya cuenta como viaje activo (faltan 30 min o menos,
    // el conductor marco llegada o ya inicio). El conductor puede ir.
    bool ScheduledActive = false,
    // El conductor del programado no llego (15 min despues de la hora sin
    // "Ya llegue"): el pasajero puede cancelar sin penalidad o republicar.
    bool DriverLate = false)
{
    // Campos agregados (no cambian los existentes)

    // Calificacion RECIBIDA por el pasajero. Hoy NO existe calificacion
    // conductor -> pasajero en el sistema (solo pasajero -> conductor en
    // trips.TripRatings), asi que siempre sale null.
    public decimal? PassengerRating { get; init; }
    public int? PassengerRatingCount { get; init; }

    // Solo en GET /api/trips/pending: nombre corto del pasajero para el
    // conductor, "Nombre A." (primer nombre + inicial del apellido paterno).
    // null si el pasajero no tiene los nombres separados (cuenta antigua).
    public string? PassengerShortName { get; init; }

    /// <summary>
    /// Arma "Nombre A.": primera palabra de firstNames + inicial del apellido
    /// paterno con punto (si lo hay). Sin firstNames devuelve null.
    /// </summary>
    public static string? BuildPassengerShortName(string? firstNames, string? lastNamePaternal)
    {
        var first = firstNames?.Trim()
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault();
        if(string.IsNullOrEmpty(first)) return null;

        var paternal = lastNamePaternal?.Trim();
        return string.IsNullOrEmpty(paternal)
            ? first
            : $"{first} {char.ToUpperInvariant(paternal[0])}.";
    }

    // GET /api/trips/pending (conductor) y GET /api/trips/active | /{id}/tracking
    // (pasajero, mientras busca conductor): cuando vence la solicitud
    // (UTC en memoria; el JSON sale en hora de Peru). null = no hay regla de
    // vencimiento. ExpiresReason dice que regla aplica:
    //   "proposal_confirm"   (solo conductor) su oferta fue aceptada por el pasajero
    //                        y debe confirmarla antes de esta hora
    //                        (driver_confirm_immediate_min / driver_confirm_scheduled_before_min)
    //   "no_driver_timeout"  viaje inmediato sin conductor: Bugie lo cancela a esta
    //                        hora (publicacion + trip_no_driver_cancel_min)
    //   "scheduled_time"     programado sin conductor: se cancela al llegar ScheduledAt
    public DateTime? ExpiresAt { get; init; }
    public string? ExpiresReason { get; init; }

    // Tarifa que pidio el pasajero al crear el viaje (EstimatedFare cambia al
    // asignar). Rango para proponer / contraofertar:
    //   minimo = base_fare; maximo = SuggestedFare x fare_max_multiplier.
    public decimal? SuggestedFare { get; init; }

    // Oferta vigente del pasajero. Por defecto = EstimatedFare (lo que el
    // pasajero ofrecio al crear el viaje). En GET /api/trips/pending es la
    // ultima contraoferta del pasajero hacia ESE conductor, si existe.
    private readonly decimal? _passengerOfferFare;
    public decimal PassengerOfferFare
    {
        get => _passengerOfferFare ?? EstimatedFare;
        init => _passengerOfferFare = value;
    }
}

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
/// Si el pasajero nunca envió su ubicación (p.ej. pidió desde la web), Lat/Lng
/// son las del origen y PassengerLocationKnown = false.
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
    string? DriverPhone,
    int ServiceType = 0,
    DateTime? StartedAt = null,
    bool PassengerLocationKnown = false);
public record ProposeFareRequest(decimal ProposedFare);
public record CompleteTripRequest(decimal FinalFare);
public record CancelTripRequest(string? Reason);

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
    string? DriverPhotoUrl = null,
    // Calificacion recibida por el conductor (trips.TripRatings).
    // null / 0 si todavia no tiene calificaciones.
    decimal? DriverRating = null,
    int DriverRatingCount = 0,
    // Solo en estado accepted_by_passenger: hasta cuando el conductor puede
    // confirmar (despues vence como rejected / driver_no_confirm).
    DateTime? ConfirmExpiresAt = null);   // "passenger" | "driver" | null � NUEVO

public record ProposalHistoryDto(
    Guid Id,
    decimal Fare,
    string Status,
    DateTime CreatedAt,
    string ProposedByRole = "driver",
    string? RejectedBy = null);   // NUEVO