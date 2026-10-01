using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Bugie.Trips.Domain.External;

public interface IDriversClient
{
    /// <summary>
    /// Devuelve el vehículo activo de cada conductor (por UserId).
    /// </summary>
    Task<Dictionary<Guid, VehicleInfoDto>> GetVehiclesByDriverUserIdsAsync(
        IEnumerable<Guid> driverUserIds, CancellationToken ct = default);

    /// <summary>
    /// Devuelve el estado del conductor por su DriverId.
    /// Devuelve null si no se encuentra o hay error.
    /// </summary>
    Task<DriverStatusDto?> GetDriverStatusAsync(Guid driverId, CancellationToken ct = default);

    /// <summary>
    /// Devuelve el estado del conductor por el UserId del usuario logueado.
    /// Devuelve null si no se encuentra o hay error.
    /// </summary>
    Task<DriverStatusDto?> GetDriverStatusByUserIdAsync(Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Devuelve info enriquecida (foto del conductor, rating, datos completos del vehículo
    /// incluyendo foto) para una lista de DriverIds. Usado por el historial de viajes
    /// del pasajero para mostrar el detalle del conductor en cada viaje.
    /// </summary>
    Task<Dictionary<Guid, DriverTripInfoDto>> GetDriverTripInfoAsync(
        IEnumerable<Guid> driverIds, CancellationToken ct = default);

    /// <summary>
    /// Devuelve la última posición conocida del conductor por su UserId.
    /// Usado por el pasajero durante el viaje para mostrar dónde está su conductor.
    /// Devuelve null si el conductor no existe o no tiene posición reportada.
    /// </summary>
    Task<DriverLocationDto?> GetDriverLocationByUserIdAsync(
        Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Notifica a Drivers.Api que un conductor recibió una calificación.
    /// Drivers actualiza Driver.Rating (promedio) y Driver.TotalRatings.
    /// Devuelve true si fue exitoso, false si hubo error.
    /// </summary>
    Task<bool> AddDriverRatingAsync(
        Guid driverUserId, byte stars, CancellationToken ct = default);

    /// <summary>
    /// Devuelve los UserIds de conductores cercanos (online + approved)
    /// a un punto dado. Lo usa FcmSender para mandar push solo a los
    /// conductores que están cerca y pueden tomar el viaje.
    /// Devuelve lista vacía si hay error (no rompemos flujo de creación).
    /// </summary>
    Task<List<Guid>> GetNearbyDriverUserIdsAsync(
        double lat, double lng, double radiusKm, int maxResults = 20,
        CancellationToken ct = default);
}

/// <summary>
/// Última posición de un conductor (lat/lng) con timestamp del último update.
/// </summary>
public record DriverLocationDto(double Lat, double Lng, DateTime? UpdatedAt);

/// <summary>
/// Status: 1=PendingDocs, 2=UnderReview, 3=Approved, 4=Suspended, 5=Rejected, 6=ExpiredDocs
/// </summary>
public record DriverStatusDto(Guid Id, Guid UserId, int Status);

/// <summary>
/// Info enriquecida de un conductor + su vehículo, usada en el historial de viajes.
/// </summary>
public record DriverTripInfoDto(
    Guid DriverId,
    Guid UserId,
    string? PhotoUrl,
    decimal Rating,
    int TotalRatings,
    string? VehiclePlate,
    string? VehicleBrand,
    string? VehicleModel,
    string? VehicleColor,
    short? VehicleYear,
    string? VehiclePhotoUrl);