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

        // Historial del CONDUCTOR: el pasajero va solo con sus iniciales
        // (privacidad, ej. "L. M."). El nombre completo nunca sale de aqui.
        var passengerInitials = new Dictionary<Guid, string>();
        if(q.Role == "driver")
        {
            var passengerIds = list.Select(t => t.PassengerId).Distinct().ToArray();
            if(passengerIds.Length > 0)
            {
                var passengers = await _auth.GetUsersByIdsAsync(passengerIds, ct);
                foreach(var (id, u) in passengers)
                    passengerInitials[id] = Initials(u.FullName);
            }
        }

        return list.Select(t =>
        {
            int? stars = ratings.GetValueOrDefault(t.Id)?.Stars;
            var passengerName = passengerInitials.GetValueOrDefault(t.PassengerId);

            if(t.DriverId is null)
                return CreateTripHandler.ToDto(t, passengerName: passengerName, passengerStars: stars);

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
                passengerName: passengerName,
                passengerStars: stars);
        }).ToList();
    }

    /// <summary>"Luis Martinez" -> "L. M." (maximo dos iniciales).</summary>
    private static string? Initials(string? fullName)
    {
        if(string.IsNullOrWhiteSpace(fullName)) return null;
        var parts = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(2);
        return string.Join(" ", parts.Select(p => char.ToUpperInvariant(p[0]) + "."));
    }
}
