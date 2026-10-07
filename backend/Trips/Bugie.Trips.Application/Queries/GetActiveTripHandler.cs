using MediatR;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Common;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public class GetActiveTripHandler : IRequestHandler<GetActiveTripQuery, TripDto?>
{
    private readonly ITripRepository _trips;
    private readonly IDriversClient _drivers;
    private readonly IAuthClient _auth;
    private readonly ILandingClient _landing;

    public GetActiveTripHandler(
        ITripRepository trips, IDriversClient drivers, IAuthClient auth, ILandingClient landing)
    {
        _trips = trips;
        _drivers = drivers;
        _auth = auth;
        _landing = landing;
    }

    public async Task<TripDto?> Handle(GetActiveTripQuery q, CancellationToken ct)
    {
        var trip = q.TripId.HasValue
            ? await _trips.GetByIdAsync(q.TripId.Value, ct)
            : await _trips.GetActiveTripAsync(q.UserId, ct);
        if(trip is null) return null;
        if(trip.PassengerId != q.UserId && trip.DriverId != q.UserId) return null;

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

        // Nombre y foto del pasajero (lo muestra el conductor en su viaje activo).
        var pax = (await _auth.GetUsersByIdsAsync(new[] { trip.PassengerId }, ct))
            .GetValueOrDefault(trip.PassengerId);

        var dto = CreateTripHandler.ToDto(trip, waypointDtos, driverLoc,
            passengerName: pax?.FullName,
            passengerPhotoUrl: pax?.ProfilePhotoUrl,
            driverName: driverName,
            driverPhotoUrl: driverPhotoUrl,
            driverRating: driverRating,
            vehiclePlate: vehiclePlate,
            vehicleBrand: vehicleBrand,
            vehicleModel: vehicleModel,
            vehicleColor: vehicleColor,
            vehiclePhotoUrl: vehiclePhotoUrl);

        // Pasajero buscando conductor: hasta cuando sigue la busqueda
        // (misma regla que POST /api/trips: TripSearchExpiry).
        if(trip.PassengerId == q.UserId)
            return await Bugie.Trips.Application.Services.TripSearchExpiry.ApplyAsync(dto, trip, _landing, ct);
        return dto;
    }
}