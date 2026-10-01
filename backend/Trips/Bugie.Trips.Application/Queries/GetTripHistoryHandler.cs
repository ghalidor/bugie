using MediatR;
using Bugie.Trips.Application.Commands;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Queries;

public class GetTripHistoryHandler : IRequestHandler<GetTripHistoryQuery, List<TripDto>>
{
    private readonly ITripRepository _trips;
    private readonly IDriversClient _drivers;
    private readonly IAuthClient _auth;
    private readonly ITripRatingRepository _ratings;

    public GetTripHistoryHandler(
        ITripRepository trips, IDriversClient drivers, IAuthClient auth,
        ITripRatingRepository ratings)
    {
        _trips = trips;
        _drivers = drivers;
        _auth = auth;
        _ratings = ratings;
    }

    public async Task<List<TripDto>> Handle(GetTripHistoryQuery q, CancellationToken ct)
    {
        var list = q.Role == "driver"
            ? await _trips.GetByDriverAsync(q.UserId, ct)
            : await _trips.GetByPassengerAsync(q.UserId, ct);

        // Enriquecer con datos del conductor (nombre, foto, vehiculo y foto del
        // vehiculo) para que el pasajero vea la card del conductor en el detalle.
        var driverIds = list
            .Where(t => t.DriverId is not null)
            .Select(t => t.DriverId!.Value)
            .Distinct()
            .ToArray();

        var infos = new Dictionary<Guid, DriverTripInfoDto>();
        var users = new Dictionary<Guid, UserInfoDto>();
        if(driverIds.Length > 0)
        {
            infos = await _drivers.GetDriverTripInfoAsync(driverIds, ct);
            users = await _auth.GetUsersByIdsAsync(driverIds, ct);
        }

        // Estrellas que el pasajero dejo por viaje (para el historial del
        // conductor). Batch por ids de viaje.
        var tripIds = list.Select(t => t.Id).ToArray();
        var ratings = tripIds.Length > 0
            ? await _ratings.GetByTripIdsAsync(tripIds, ct)
            : new Dictionary<Guid, TripRating>();

        return list.Select(t =>
        {
            int? stars = ratings.GetValueOrDefault(t.Id)?.Stars;

            if(t.DriverId is null)
                return CreateTripHandler.ToDto(t, passengerStars: stars);

            var did = t.DriverId.Value;
            var info = infos.GetValueOrDefault(did);
            var user = users.GetValueOrDefault(did);
            return CreateTripHandler.ToDto(t,
                driverName: user?.FullName,
                driverPhotoUrl: info?.PhotoUrl ?? user?.ProfilePhotoUrl,
                driverRating: info?.Rating,
                vehiclePlate: info?.VehiclePlate,
                vehicleBrand: info?.VehicleBrand,
                vehicleModel: info?.VehicleModel,
                vehicleColor: info?.VehicleColor,
                vehiclePhotoUrl: info?.VehiclePhotoUrl,
                passengerStars: stars);
        }).ToList();
    }
}
