using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public class CreateTripHandler : IRequestHandler<CreateTripCommand, TripDto>
{
    private readonly ITripRepository _trips;
    private readonly IAuthClient _auth;
    private readonly IFcmSender _fcm;
    private readonly IDriversClient _drivers;
    private readonly ILandingClient _landing;

    public CreateTripHandler(
        ITripRepository trips,
        IAuthClient auth,
        IFcmSender fcm,
        IDriversClient drivers,
        ILandingClient landing)
    {
        _trips = trips;
        _auth = auth;
        _fcm = fcm;
        _drivers = drivers;
        _landing = landing;
    }

    public async Task<TripDto> Handle(CreateTripCommand cmd, CancellationToken ct)
    {
        // Validación 1: el pasajero debe estar verificado (DNI aprobado por admin).
        // El frontend ya bloquea visualmente, pero esta validación blinda el backend:
        // si alguien llamara el endpoint directo (Postman, etc.) sin pasar por la UI,
        // igual rechazamos. La verificación es vía Auth.Api (un solo round-trip).
        var users = await _auth.GetUsersByIdsAsync(new[] { cmd.PassengerId }, ct);
        if(!users.TryGetValue(cmd.PassengerId, out var passenger))
        {
            throw new KeyNotFoundException("Usuario no encontrado.");
        }
        if(!passenger.IsVerified)
        {
            throw new InvalidOperationException(
                "Tu cuenta aún no está verificada. Sube tu DNI desde el perfil y espera la aprobación del administrador para solicitar viajes.");
        }

        // Validación 2: el pasajero no puede crear un viaje si ya tiene uno activo.
        // "Activo" significa cualquier status que NO sea completed (4) o cancelled (5).
        // Esto evita que un pasajero tenga 2 viajes en paralelo y que pueda
        // saltarse el flujo cancelando o terminando el viaje actual.
        var existing = await _trips.GetActiveTripAsync(cmd.PassengerId, ct);
        if(existing is not null)
        {
            throw new InvalidOperationException(
                "Ya tienes un viaje en curso. Termínalo o cancélalo antes de solicitar otro.");
        }

        var trip = Trip.Create(
            cmd.PassengerId,
            cmd.OriginAddress, cmd.OriginLat, cmd.OriginLng,
            cmd.DestAddress, cmd.DestLat, cmd.DestLng,
            cmd.EstimatedFare, cmd.PaymentMethod,
            serviceType: cmd.ServiceType,
            packageDescription: cmd.PackageDescription,
            packageWeightKg: cmd.PackageWeightKg,
            packageIsFragile: cmd.PackageIsFragile,
            packageDetails: cmd.PackageDetails);

        await _trips.AddAsync(trip, ct);

        if(cmd.Waypoints?.Count > 0)
        {
            var waypoints = cmd.Waypoints.Select((wp, i) => new TripWaypoint
            {
                TripId = trip.Id,
                Address = wp.Address,
                Lat = wp.Lat,
                Lng = wp.Lng,
                SortOrder = i,
            }).ToList();
            await _trips.SaveWaypointsAsync(trip.Id, waypoints, ct);
        }

        // ?? Notificación push a conductores ??????????????????????????????
        // Por ahora, el FcmSender es STUB (solo loguea). Cuando se active
        // Firebase, este código mandará push a TODOS los conductores online
        // — el filtro real "cercanos + approved" lo aplicamos cuando ya
        // tengamos el flujo end-to-end probado. El polling actual del
        // conductor sigue funcionando como respaldo si el push falla.
        //
        // Se llama fire-and-forget (no await): si tarda o falla, NO bloquea
        // la respuesta al pasajero. El viaje ya está creado en BD.
        // IMPORTANTE: usamos CancellationToken.None — si pasáramos `ct`, cuando
        // el POST /api/trips responde al cliente el token se cancela y aborta
        // las llamadas HTTP a Drivers/Auth/FCM a mitad de camino.
        _ = NotifyDriversAsync(trip, cmd.EstimatedFare, CancellationToken.None);

        return ToDto(trip);
    }

    /// <summary>
    /// Manda push notification a los conductores cercanos avisando que
    /// hay una nueva solicitud. Fire-and-forget: corre en background, no
    /// bloquea la respuesta al pasajero.
    /// </summary>
    private async Task NotifyDriversAsync(Trip trip, decimal estimatedFare, CancellationToken ct)
    {
        try
        {
            // 1. Saber qué radio usar (el admin lo configura en Landing).
            //    Fallback: 5 km (5000m) si Landing no responde.
            var radiusMeters = await _landing.GetMaxRadiusMetersAsync(5000, ct);
            var radiusKm = radiusMeters / 1000.0;

            // 2. Conductores cercanos al ORIGEN del viaje.
            //    El endpoint de Drivers ya filtra online + approved.
            var userIds = await _drivers.GetNearbyDriverUserIdsAsync(
                trip.OriginLat, trip.OriginLng, radiusKm, maxResults: 20, ct);

            if(userIds.Count == 0) return;

            // 3. Mandar push. El cliente Flutter, al tocar, va a /driver/requests.
            var msg = new FcmPushMessage(
                Title: "Nueva solicitud de viaje",
                Body: $"S/ {estimatedFare:F2} · {trip.OriginAddress}",
                Route: "/driver/requests",
                ExtraData: new Dictionary<string, string>
                {
                    ["tripId"] = trip.Id.ToString(),
                });
            await _fcm.SendToUsersAsync(userIds, msg, ct);
        }
        catch(Exception ex)
        {
            // Si falla el push, NO afectamos el flujo principal. El conductor
            // igual va a ver el viaje en su polling de /api/trips/pending.
            // Logueamos para diagnóstico, pero no propagamos.
            Console.WriteLine($"NotifyDriversAsync error: {ex.Message}");
        }
    }

    public static TripDto ToDto(
        Trip t,
        List<WaypointDto>? waypoints = null,
        DriverLocationDto? driverLoc = null,
        string? passengerName = null,
        string? passengerPhotoUrl = null,
        string? driverName = null,
        string? driverPhotoUrl = null,
        decimal? driverRating = null,
        string? vehiclePlate = null,
        string? vehicleBrand = null,
        string? vehicleModel = null,
        string? vehicleColor = null,
        string? vehiclePhotoUrl = null,
        int? passengerStars = null) => new(
        t.Id, t.PassengerId, t.DriverId,
        t.OriginAddress, t.OriginLat, t.OriginLng,
        t.DestAddress, t.DestLat, t.DestLng,
        t.EstimatedFare, t.ProposedFare, t.ProposedDriverId,
        t.FinalFare, t.PaymentMethod, t.Status,
        t.CreatedAt, t.StartedAt, t.CompletedAt, waypoints,
        driverLoc?.Lat, driverLoc?.Lng, driverLoc?.UpdatedAt,
        t.ServiceType, t.PackageDescription, t.PackageWeightKg, t.PackageIsFragile, t.PackageDetails,
        t.PickupVerified, t.PickupObservation,
        passengerName, passengerPhotoUrl,
        driverName, driverPhotoUrl, driverRating,
        vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, vehiclePhotoUrl,
        passengerStars,
        t.CouponCode, t.DiscountAmount, t.FareBeforeDiscount,
        t.AcceptedAt, t.DriverArrivedAt,
        t.CancelledBy, t.CancelReason, t.CancelledAt);
}