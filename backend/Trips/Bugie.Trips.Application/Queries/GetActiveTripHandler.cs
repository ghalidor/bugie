using MediatR;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public class GetActiveTripHandler : IRequestHandler<GetActiveTripQuery, TripDto?>
{
    private readonly ITripRepository _trips;
    private readonly IDriversClient _drivers;
    private readonly IAuthClient _auth;

    public GetActiveTripHandler(
        ITripRepository trips, IDriversClient drivers, IAuthClient auth)
    {
        _trips = trips;
        _drivers = drivers;
        _auth = auth;
    }

    public async Task<TripDto?> Handle(GetActiveTripQuery q, CancellationToken ct)
    {
        var trip = await _trips.GetActiveTripAsync(q.UserId, ct);
        if(trip is null) return null;

        // Cargar waypoints del viaje
        var waypoints = await _trips.GetWaypointsAsync(trip.Id, ct);
        var waypointDtos = waypoints
            .OrderBy(w => w.SortOrder)
            .Select(w => new WaypointDto(w.Id, w.Address, w.Lat, w.Lng, w.SortOrder))
            .ToList();

        // Si hay conductor asignado y el viaje está accepted/inProgress/sosActive,
        // traer su última posición. Esto permite al pasajero ver dónde está su
        // conductor en el mapa y calcular distancia/ETA.
        // No bloqueamos: si falla, devolvemos el trip sin posición.
        DriverLocationDto? driverLoc = null;
        string? driverName = null, driverPhotoUrl = null, vehiclePlate = null,
            vehicleBrand = null, vehicleModel = null, vehicleColor = null,
            vehiclePhotoUrl = null;
        decimal? driverRating = null;

        if(trip.DriverId is not null &&
           (trip.Status == TripStatus.Accepted ||
            trip.Status == TripStatus.InProgress ||
            trip.Status == TripStatus.SosActive))
        {
            var driverId = trip.DriverId.Value;
            driverLoc = await _drivers.GetDriverLocationByUserIdAsync(driverId, ct);

            // Datos del conductor asignado para mostrar en el seguimiento:
            // foto, vehiculo y foto del vehiculo (Drivers) + nombre (Auth).
            var info = (await _drivers.GetDriverTripInfoAsync(new[] { driverId }, ct))
                .GetValueOrDefault(driverId);
            var user = (await _auth.GetUsersByIdsAsync(new[] { driverId }, ct))
                .GetValueOrDefault(driverId);
            driverName = user?.FullName;
            driverPhotoUrl = info?.PhotoUrl ?? user?.ProfilePhotoUrl;
            driverRating = info?.Rating;
            vehiclePlate = info?.VehiclePlate;
            vehicleBrand = info?.VehicleBrand;
            vehicleModel = info?.VehicleModel;
            vehicleColor = info?.VehicleColor;
            vehiclePhotoUrl = info?.VehiclePhotoUrl;
        }

        return CreateTripHandler.ToDto(trip, waypointDtos, driverLoc,
            driverName: driverName,
            driverPhotoUrl: driverPhotoUrl,
            driverRating: driverRating,
            vehiclePlate: vehiclePlate,
            vehicleBrand: vehicleBrand,
            vehicleModel: vehicleModel,
            vehicleColor: vehicleColor,
            vehiclePhotoUrl: vehiclePhotoUrl);
    }
}