using MediatR;
using Bugie.Trips.Application.DTOs;
using Bugie.Trips.Domain.Entities;
using Bugie.Trips.Domain.Enums;
using Bugie.Trips.Domain.External;
using Bugie.Trips.Domain.Interfaces;

namespace Bugie.Trips.Application.Commands;

public class CreateTripHandler : IRequestHandler<CreateTripCommand, TripDto>,
    IRequestHandler<NotifyNearbyDriversCommand>
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
        // Programados: no se bloquean por un viaje activo (son para mas tarde),
        // y un programado futuro tampoco cuenta como activo (ver GetActiveTripAsync).
        var existing = cmd.ScheduledAt.HasValue ? null : await _trips.GetActiveTripAsync(cmd.PassengerId, ct);
        if(existing is not null)
        {
            throw new InvalidOperationException(
                "Ya tienes un viaje en curso. Termínalo o cancélalo antes de solicitar otro.");
        }

        // Validacion 3: el pasajero no puede tener dos programados propios a menos
        // de 1 hora uno del otro (misma regla que para el conductor).
        if(cmd.ScheduledAt.HasValue)
        {
            var conflict = await Bugie.Trips.Application.Services.ScheduledConflicts
                .FindPassengerConflictMessageAsync(_trips, cmd.PassengerId, cmd.ScheduledAt.Value, ct);
            if(conflict is not null) throw new InvalidOperationException(conflict);
        }

        // Envio: hace falta saber a quien se entrega.
        var recipientName  = cmd.RecipientName?.Trim();
        var recipientPhone = cmd.RecipientPhone?.Trim();
        if(cmd.ServiceType == ServiceType.Delivery &&
           (string.IsNullOrWhiteSpace(recipientName) || string.IsNullOrWhiteSpace(recipientPhone)))
            throw new InvalidOperationException("Indica el nombre y el teléfono de quien recibe el envío.");

        var trip = Trip.Create(
            cmd.PassengerId,
            cmd.OriginAddress, cmd.OriginLat, cmd.OriginLng,
            cmd.DestAddress, cmd.DestLat, cmd.DestLng,
            cmd.EstimatedFare, cmd.PaymentMethod,
            serviceType: cmd.ServiceType,
            packageDescription: cmd.PackageDescription,
            packageWeightKg: cmd.PackageWeightKg,
            packageIsFragile: cmd.PackageIsFragile,
            packageDetails: cmd.PackageDetails,
            recipientName: cmd.ServiceType == ServiceType.Delivery ? recipientName : null,
            recipientPhone: cmd.ServiceType == ServiceType.Delivery ? recipientPhone : null,
            scheduledAt: cmd.ScheduledAt);

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
        if(cmd.NotifyDrivers)
        {
            // Envios: la lista de conductores sale de la BD. Se lee AQUI (con la conexion
            // de la peticion viva); solo el push va en segundo plano. Si la consulta corre
            // en segundo plano, la conexion se cierra al responder y queda corrupta en el pool.
            var deliveryDrivers = await DeliveryDriversAsync(trip, ct);
            _ = NotifyDriversAsync(trip, cmd.EstimatedFare, deliveryDrivers, CancellationToken.None);
        }

        return ToDto(trip);
    }

    // Aviso a conductores cuando el viaje ya existe (envios: tras guardar las fotos).
    public async Task Handle(NotifyNearbyDriversCommand cmd, CancellationToken ct)
    {
        var trip = await _trips.GetByIdAsync(cmd.TripId, ct);
        if(trip is null) return;
        var deliveryDrivers = await DeliveryDriversAsync(trip, ct);
        _ = NotifyDriversAsync(trip, trip.EstimatedFare, deliveryDrivers, CancellationToken.None);
    }

    /// <summary>
    /// Manda push notification a los conductores cercanos avisando que
    /// hay una nueva solicitud. Fire-and-forget: corre en background, no
    /// bloquea la respuesta al pasajero.
    /// </summary>
    /// Envios: todos los conductores conectados y aprobados (null si es viaje).
    private async Task<List<Guid>?> DeliveryDriversAsync(Trip trip, CancellationToken ct)
    {
        if(trip.ServiceType != ServiceType.Delivery) return null;
        try { return await _trips.GetOnlineApprovedDriverUserIdsAsync(ct); }
        catch(Exception ex)
        {
            Console.WriteLine($"DeliveryDriversAsync error: {ex.Message}");
            return new List<Guid>();
        }
    }

    private async Task NotifyDriversAsync(Trip trip, decimal estimatedFare, List<Guid>? deliveryDriverIds, CancellationToken ct)
    {
        try
        {
            var isDelivery = trip.ServiceType == ServiceType.Delivery;
            List<Guid> userIds;
            if(isDelivery)
            {
                // Envios: a TODOS los conductores conectados y aprobados, sin distancia.
                // Ya calculados antes de responder (ver DeliveryDriversAsync).
                userIds = deliveryDriverIds ?? new List<Guid>();
            }
            else
            {
                // 1. Saber qué radio usar (el admin lo configura en Landing).
                //    Fallback: 5 km (5000m) si Landing no responde.
                var radiusMeters = await _landing.GetMaxRadiusMetersAsync(5000, ct);
                var radiusKm = radiusMeters / 1000.0;

                // 2. Conductores cercanos al ORIGEN del viaje.
                //    El endpoint de Drivers ya filtra online + approved.
                userIds = await _drivers.GetNearbyDriverUserIdsAsync(
                    trip.OriginLat, trip.OriginLng, radiusKm, maxResults: 20, ct);
            }

            if(userIds.Count == 0) return;

            // Programado: se indica la fecha y hora (de Perú) en el aviso.
            var when = trip.ScheduledAt.HasValue
                ? $" · Programado {Bugie.Trips.Domain.Common.BugieTime.ToPeru(trip.ScheduledAt.Value):dd/MM HH:mm}"
                : "";
            // 3. Mandar push. El cliente Flutter, al tocar, va a /driver/requests.
            var msg = new FcmPushMessage(
                Title: trip.ScheduledAt.HasValue
                    ? (isDelivery ? "Nuevo envío programado" : "Nuevo viaje programado")
                    : (isDelivery ? "Nueva solicitud de envío" : "Nueva solicitud de viaje"),
                Body: isDelivery
                    ? $"S/ {estimatedFare:F2}{when} · Paquete: {trip.PackageDescription} · {trip.OriginAddress}"
                    : $"S/ {estimatedFare:F2}{when} · {trip.OriginAddress}",
                Route: "/driver/requests",
                ExtraData: new Dictionary<string, string>
                {
                    ["tripId"] = trip.Id.ToString(),
                    ["trip_id"] = trip.Id.ToString(),
                    ["alert_type"] = "proposal",
                    // Icono de viaje o envío y de quién viene (pasajero).
                    ["service"] = isDelivery ? "delivery" : "ride",
                    ["from"] = "passenger",
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
        t.CancelledBy, t.CancelReason, t.CancelledAt,
        t.RecipientName, t.RecipientPhone, t.DeliveryReceivedBy, t.DeliveryConfirmedAt,
        t.ScheduledAt,
        t.ScheduledAt.HasValue && !t.IsFutureScheduled(DateTime.UtcNow),
        t.IsDriverLate(DateTime.UtcNow))
        {
            // Base del maximo al negociar (viajes antiguos: la tarifa actual).
            SuggestedFare = t.SuggestedFare ?? t.EstimatedFare,
        };
}