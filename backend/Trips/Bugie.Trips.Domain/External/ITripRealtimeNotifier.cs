using Bugie.Trips.Domain.Entities;

namespace Bugie.Trips.Domain.External;

/// <summary>
/// Canal en tiempo real (SignalR, hub /hubs/trips) hacia PASAJEROS y CONDUCTORES.
/// Reemplaza el polling mientras la pantalla está abierta; FCM sigue para la app
/// cerrada y los clientes conservan un polling de respaldo (30-60 s).
///
/// Los eventos son LIVIANOS: solo ids, estado y motivo. El cliente, al recibirlos,
/// vuelve a cargar con los endpoints de siempre (/active, /tracking, /proposals,
/// /pending...). Así no hay que mantener dos contratos de datos.
///
/// Todos los métodos son "best effort": nunca lanzan excepción (la implementación
/// hace try/catch + log). Los datos siempre están en BD; esto solo baja la latencia.
/// </summary>
public interface ITripRealtimeNotifier
{
    /// <summary>
    /// "TripChanged": el viaje cambió de estado o de datos relevantes.
    /// Va al grupo trip:{tripId}, a user:{passengerId}, a user:{driverId} (si hay)
    /// y a cada usuario extra de <paramref name="alsoNotify"/> (ej. el conductor
    /// que acaba de ser quitado del viaje, que ya no figura en DriverId).
    /// Payload: { tripId, status, reason, at }. Motivos en <see cref="RealtimeReasons"/>.
    /// </summary>
    Task TripChangedAsync(Guid tripId, int status, string reason, Guid passengerId, Guid? driverId,
        IEnumerable<Guid>? alsoNotify = null, CancellationToken ct = default);

    /// <summary>
    /// "ProposalsChanged": cambió la negociación del viaje (oferta nueva, contraoferta,
    /// aceptación, rechazo, vencimiento...). Va al grupo trip:{tripId}, a
    /// user:{passengerId} y a user:{driverId} (el conductor afectado, si aplica).
    /// Payload: { tripId, proposalId?, driverId?, status?, reason, at }.
    /// </summary>
    Task ProposalsChangedAsync(Guid tripId, Guid passengerId, Guid? driverId, Guid? proposalId,
        string? status, string reason, CancellationToken ct = default);

    /// <summary>
    /// "DriverLocation": posición del conductor del viaje. Solo al grupo trip:{tripId}
    /// (el pasajero que sigue el viaje). Payload: { tripId, lat, lng, heading?, speedKmh?, at }.
    /// </summary>
    Task DriverLocationAsync(Guid tripId, double lat, double lng, double? heading, double? speedKmh,
        CancellationToken ct = default);

    /// <summary>
    /// "RequestsChanged": cambió la lista de solicitudes abiertas para los conductores.
    /// Va al grupo drivers:requests. Cada conductor recarga GET /api/trips/pending
    /// (el filtro por radio sigue en el servidor). Payload: { tripId, reason, at }.
    /// Motivos: published | withdrawn | taken | reopened | cancelled.
    /// </summary>
    Task RequestsChangedAsync(Guid tripId, string reason, CancellationToken ct = default);

    /// <summary>
    /// "UserNotification": espejo de cada push FCM que se manda al usuario, para que la
    /// web (sin FCM) reciba los mismos avisos. Va a user:{userId}.
    /// Payload: { type?, title, body, data, at } (data = el mismo data del push, incluido
    /// notification_id de la bandeja cuando existe).
    /// </summary>
    Task UserNotificationAsync(Guid userId, string? type, string title, string body,
        IReadOnlyDictionary<string, string>? data, CancellationToken ct = default);
}

/// <summary>Motivos (reason) de los eventos TripChanged y RequestsChanged.</summary>
public static class RealtimeReasons
{
    // TripChanged
    public const string Created           = "created";
    public const string Proposal          = "proposal";           // pasó a Negotiating por la primera oferta
    public const string Accepted          = "accepted";           // conductor asignado
    public const string DriverArrived     = "driver_arrived";
    public const string Started           = "started";
    public const string Completed         = "completed";
    public const string Cancelled         = "cancelled";
    public const string Reopened          = "reopened";           // programado que vuelve a buscar conductor
    public const string Sos               = "sos";
    public const string SosResolved       = "sos_resolved";
    public const string Coupon            = "coupon";             // cupón aplicado o quitado
    public const string ScheduledReminder = "scheduled_reminder";
    public const string ScheduledNoDriver = "scheduled_no_driver";
    public const string PickupVerified    = "pickup_verified";    // envío: paquete recogido y verificado
    public const string DeliveryConfirmed = "delivery_confirmed"; // envío: entrega confirmada

    // RequestsChanged
    public const string Published = "published";
    public const string Withdrawn = "withdrawn"; // el pasajero (o un admin) canceló una solicitud abierta
    public const string Taken     = "taken";
    public const string RequestsReopened = "reopened";
    public const string Expired   = "cancelled"; // Bugie la canceló por vencimiento
}

/// <summary>Atajos para disparar eventos desde un <see cref="Trip"/> ya cargado.</summary>
public static class TripRealtimeNotifierExtensions
{
    /// <summary>TripChanged con los ids y el estado del viaje tal como está en memoria.</summary>
    public static Task TripChangedAsync(this ITripRealtimeNotifier notifier, Trip trip, string reason,
        IEnumerable<Guid>? alsoNotify = null, CancellationToken ct = default) =>
        notifier.TripChangedAsync(trip.Id, (int)trip.Status, reason, trip.PassengerId, trip.DriverId,
            alsoNotify, ct);
}
