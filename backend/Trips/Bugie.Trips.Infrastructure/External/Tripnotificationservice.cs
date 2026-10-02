using Bugie.Trips.Domain.External;

namespace Bugie.Trips.Infrastructure.External;

/// <summary>
/// Implementación de ITripNotificationService. Construye los mensajes FCM
/// según el evento y los manda al destinatario indicado.
///
/// Cada método:
///   1) Construye el FcmPushMessage con title/body/route/alert_type.
///   2) Llama a IFcmSender.SendToUserAsync.
///   3) Captura excepciones y las loguea (no propaga).
///
/// alert_type permite al Flutter clasificar el banner (color/icono):
///   trip / proposal / accepted / sos.
/// </summary>
public class TripNotificationService : ITripNotificationService
{
    private readonly IFcmSender _fcm;

    public TripNotificationService(IFcmSender fcm) => _fcm = fcm;

    // ── EVENTO: pasajero aceptó propuesta del conductor ──────────────────
    public Task NotifyDriverPassengerAcceptedAsync(
        Guid driverUserId, Guid tripId, decimal fare) =>
        SafeSend(driverUserId, new FcmPushMessage(
            Title: "¡El pasajero aceptó!",
            Body: $"Confirmá el viaje a S/ {fare:0.00} para empezar.",
            Route: $"/driver/incoming/{tripId}",
            ExtraData: new Dictionary<string, string>
            {
                ["alert_type"] = "accepted",
                ["trip_id"] = tripId.ToString(),
            }));

    // ── EVENTO: conductor confirmó aceptación, viaje en curso ─────────────
    public Task NotifyPassengerDriverConfirmedAsync(
        Guid passengerUserId, Guid tripId) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Conductor en camino",
            Body: "Tu conductor confirmó el viaje y va hacia tu ubicación.",
            Route: "/passenger/tracking",
            ExtraData: new Dictionary<string, string>
            {
                ["alert_type"] = "accepted",
                ["trip_id"] = tripId.ToString(),
            }));

    // ── EVENTO: pasajero envió contrapropuesta al conductor ──────────────
    public Task NotifyDriverPassengerCounterAsync(
        Guid driverUserId, Guid tripId, decimal fare) =>
        SafeSend(driverUserId, new FcmPushMessage(
            Title: "Contrapropuesta del pasajero",
            Body: $"El pasajero propuso S/ {fare:0.00}. Aceptás o contraproponés.",
            Route: $"/driver/incoming/{tripId}",
            ExtraData: new Dictionary<string, string>
            {
                ["alert_type"] = "proposal",
                ["trip_id"] = tripId.ToString(),
            }));

    // ── EVENTO: conductor envió propuesta al pasajero ────────────────────
    public Task NotifyPassengerDriverProposeAsync(
        Guid passengerUserId, Guid tripId, decimal fare) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Nueva propuesta de conductor",
            Body: $"Un conductor ofrece llevarte por S/ {fare:0.00}.",
            Route: "/passenger/tracking",
            ExtraData: new Dictionary<string, string>
            {
                ["alert_type"] = "proposal",
                ["trip_id"] = tripId.ToString(),
            }));

    // ── EVENTO: viaje iniciado ───────────────────────────────────────────
    public Task NotifyPassengerTripStartedAsync(
        Guid passengerUserId, Guid tripId) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Viaje iniciado",
            Body: "Tu conductor inició el viaje. ¡Buen viaje!",
            Route: "/passenger/tracking",
            ExtraData: new Dictionary<string, string>
            {
                ["alert_type"] = "accepted",
                ["trip_id"] = tripId.ToString(),
            }));

    // ── EVENTO: el conductor llegó al punto de recojo ────────────────────
    // type=driver_arrived: la app abre el seguimiento y muestra un aviso.
    public Task NotifyPassengerDriverArrivedAsync(
        Guid passengerUserId, Guid tripId) =>
        SafeSend(passengerUserId, new FcmPushMessage(
            Title: "Tu conductor llegó",
            Body: "Tu conductor ya está en el punto de recojo. Sal a su encuentro.",
            Route: "/passenger/tracking",
            ExtraData: new Dictionary<string, string>
            {
                ["alert_type"] = "arrived",
                ["type"]       = "driver_arrived",
                ["trip_id"]    = tripId.ToString(),
            }));

    // ── EVENTO: viaje cancelado ──────────────────────────────────────────
    public Task NotifyTripCancelledAsync(
        Guid recipientUserId, Guid tripId, string cancelledByRole, string? reason = null)
    {
        var who = cancelledByRole switch
        {
            "passenger" => "El pasajero",
            "driver"    => "El conductor",
            _            => "Bugie",
        };
        return SafeSend(recipientUserId, new FcmPushMessage(
            Title: "Viaje cancelado",
            Body: string.IsNullOrWhiteSpace(reason)
                ? $"{who} canceló el viaje."
                : $"{who} canceló el viaje. Motivo: {reason}",
            Route: null,
            ExtraData: new Dictionary<string, string>
            {
                // Antes iba como "sos" (copiado por error): es un aviso de viaje.
                ["alert_type"] = "trip",
                ["type"]       = "trip_cancelled",
                ["cancelled_by"] = cancelledByRole,
                ["trip_id"] = tripId.ToString(),
            }));
    }

    // ── EVENTO: pasajero rechazó la propuesta del conductor ──────────────
    public Task NotifyDriverProposalRejectedAsync(
        Guid driverUserId, Guid tripId) =>
        SafeSend(driverUserId, new FcmPushMessage(
            Title: "Propuesta rechazada",
            Body: "El pasajero rechazó tu propuesta.",
            Route: null,
            ExtraData: new Dictionary<string, string>
            {
                ["alert_type"] = "sos",
                ["trip_id"] = tripId.ToString(),
            }));

    // ── HELPER ───────────────────────────────────────────────────────────
    /// <summary>
    /// Manda el push de forma segura: usa CancellationToken.None (para no
    /// cancelarse cuando termina el HTTP request) y captura excepciones para
    /// no romper el flujo principal del controller que lo llama.
    /// </summary>
    private async Task SafeSend(Guid userId, FcmPushMessage msg)
    {
        try
        {
            await _fcm.SendToUserAsync(userId, msg, CancellationToken.None);
        }
        catch(Exception ex)
        {
            Console.WriteLine($"TripNotificationService error: {ex.Message}");
        }
    }
}